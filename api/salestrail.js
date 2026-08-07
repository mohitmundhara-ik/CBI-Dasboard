// api/salestrail.js — Salestrail Call Analytics, proxied.
// Deployed at https://cbi-dashboard-ik.vercel.app/api/salestrail
//
// This has to run server-side. Salestrail uses HTTP Basic auth, and Basic auth
// credentials in a browser file are readable by anyone you send the file to.
// The proxy keeps them in Vercel's environment instead.
//
// Environment variables (Vercel → Settings → Environment Variables):
//   SALESTRAIL_USER   your Salestrail API username
//   SALESTRAIL_PASS   the password / API key that goes with it
//   API_KEY           the same one the sheet proxy uses
//
// Routes:
//   /api/salestrail?from=…&to=…                 the calls in a window
//   /api/salestrail?callId=…&recording=1        a signed link to one recording
//   /api/salestrail?probe=1                     check the credentials work

const BASE = "https://standalone-api.salestrail.io";

function authHeader() {
  const u = process.env.SALESTRAIL_USER, p = process.env.SALESTRAIL_PASS;
  if (!u) throw new Error("SALESTRAIL_USER is not set in Vercel");
  if (!p) throw new Error("SALESTRAIL_PASS is not set in Vercel — Salestrail uses Basic auth, so the username alone is not enough");
  return "Basic " + Buffer.from(`${u}:${p}`).toString("base64");
}

// India mobile numbers arrive in several shapes. Reduce every one to the last
// ten digits, which is the only part that reliably identifies the subscriber.
function last10(n) {
  const d = String(n ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "x-api-key, content-type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (process.env.API_KEY) {
    const given = req.headers["x-api-key"] || req.query.key;
    if (given !== process.env.API_KEY) return res.status(401).json({ error: "Wrong or missing key" });
  }

  try {
    const auth = authHeader();

    // --- are the credentials right? ---
    if (req.query.probe) {
      const to = new Date(), from = new Date(Date.now() - 864e5);
      const r = await fetch(
        `${BASE}/export/calls/json?from=${from.toISOString()}&to=${to.toISOString()}`,
        { headers: { Authorization: auth, Accept: "application/json" } });
      const ok = r.ok;
      let sample = null;
      if (ok) { const j = await r.json().catch(() => []); sample = Array.isArray(j) ? j.length : 0; }
      return res.status(200).json({
        ok,
        http: r.status,
        callsInTheLast24h: sample,
        user: process.env.SALESTRAIL_USER ? "(set)" : "(NOT SET)",
        pass: process.env.SALESTRAIL_PASS ? "(set)" : "(NOT SET)",
        whatToDo: ok
          ? "Credentials work. Pull a date range next."
          : r.status === 401
            ? "Salestrail rejected the credentials. The username is only half of it — SALESTRAIL_PASS needs the password or API key that came with it."
            : `Salestrail answered ${r.status}.`,
      });
    }

    // --- a single recording ---
    // Salestrail 302s to a time-limited Azure blob link. The audio is m4a/mp4.
    if (req.query.callId && req.query.recording) {
      const r = await fetch(`${BASE}/export/calls/${encodeURIComponent(req.query.callId)}/recording`,
        { headers: { Authorization: auth }, redirect: "manual" });

      const loc = r.headers.get("location");
      // Hand back the signed link rather than the bytes when asked - much faster,
      // and it lets a browser stream straight from Azure.
      if (loc && req.query.link) {
        return res.status(200).json({ ok: true, url: loc, expiresInAbout: "an hour" });
      }
      const target = loc || `${BASE}/export/calls/${encodeURIComponent(req.query.callId)}/recording`;
      const a = await fetch(target, loc ? {} : { headers: { Authorization: auth } });
      if (!a.ok) return res.status(a.status).json({ error: `Recording fetch returned ${a.status}` });
      const buf = Buffer.from(await a.arrayBuffer());
      res.setHeader("Content-Type", a.headers.get("content-type") || "audio/mp4");
      res.setHeader("Cache-Control", "private, max-age=600");
      return res.status(200).send(buf);
    }

    // --- the calls in a window ---
    const from = req.query.from, to = req.query.to;
    if (!from || !to) return res.status(400).json({ error: "Needs from and to, both ISO date-times" });

    // Salestrail's gateway times out at 30 seconds and a single day is roughly
    // 4 MB, so anything over about two days fails. Fetch a day at a time.
    const path = req.query.byCreated ? "/export/calls/byCreated/json" : "/export/calls/json";
    const t0 = new Date(from), t1 = new Date(to);
    const spans = [];
    for (let d = new Date(t0); d < t1; d.setUTCDate(d.getUTCDate() + 1)) {
      const a = new Date(d);
      const b = new Date(Math.min(new Date(d).setUTCDate(d.getUTCDate() + 1), t1.getTime()));
      spans.push([a.toISOString(), b.toISOString()]);
      if (spans.length > 31) break;            // a month is plenty
    }

    let calls = [];
    const failed = [];
    for (const [a, b] of spans) {
      const r = await fetch(`${BASE}${path}?from=${encodeURIComponent(a)}&to=${encodeURIComponent(b)}`,
        { headers: { Authorization: auth, Accept: "application/json" } });
      if (!r.ok) {
        if (r.status === 401) {
          return res.status(401).json({
            error: "Salestrail rejected the credentials",
            hint: "Check SALESTRAIL_USER and SALESTRAIL_PASS. Note the username and password are a pair - a username from a different account will always 401.",
          });
        }
        failed.push({ day: a.slice(0, 10), status: r.status });
        continue;
      }
      const chunk = await r.json().catch(() => []);
      if (Array.isArray(chunk)) calls = calls.concat(chunk);
    }
    const rows = (Array.isArray(calls) ? calls : []).map(c => ({
      callId: c.callId,
      advisorEmail: c.userEmail,
      advisorName: c.userName,
      leadNumber: c.formattedNumber || c.number,
      leadNumber10: last10(c.formattedNumber || c.number),
      startTime: c.startTime,
      createdAt: c.createdAt,
      durationSec: c.duration,
      durationMin: Math.round((c.duration || 0) / 6) / 10,
      answered: c.answered,
      inbound: c.inbound,
      recUrl: c.recUrl || "",
      recType: c.recType || "",
      hasRecording: !!c.recUrl,
      phonebookName: c.phonebookName || "",
      source: c.source,
      integrated: c.integrated,
    }));

    const withRec = rows.filter(x => x.hasRecording).length;
    const advisors = [...new Set(rows.map(x => x.advisorEmail).filter(Boolean))];
    // Optional: only the advisors you care about, so 30,000 calls become a few thousand.
    const only = String(req.query.advisors || "").split(",").map(x => x.trim()).filter(Boolean);
    const out = only.length
      ? rows.filter(x => only.includes(x.advisorName) || only.includes(x.advisorEmail))
      : rows;

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=600");
    return res.status(200).json({
      ok: true,
      window: { from, to },
      counts: {
        calls: rows.length,
        returned: out.length,
        withRecording: withRec,
        answered: rows.filter(x => x.answered).length,
        advisors: advisors.length,
        totalMinutes: Math.round(rows.reduce((a, x) => a + (x.durationSec || 0), 0) / 60),
      },
      advisors,
      daysFetched: spans.length,
      daysFailed: failed,
      filteredToAdvisors: only.length || null,
      calls: out,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}

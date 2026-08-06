// api/salestrail.js — Salestrail Call Analytics, proxied.
//
// This has to run server-side. Salestrail uses HTTP Basic auth, and Basic auth
// credentials in a browser file are readable by anyone you send the file to.
// The proxy keeps them in Vercel's environment instead.
//
// Environment variables (Vercel → Settings → Environment Variables):
//   SALESTRAIL_USER   bbcfcc1d-8476-4464-a2a5-80ee203e5973
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
    if (req.query.callId && req.query.recording) {
      const r = await fetch(`${BASE}/export/calls/${encodeURIComponent(req.query.callId)}/recording`,
        { headers: { Authorization: auth } });
      if (!r.ok) return res.status(r.status).json({ error: `Salestrail returned ${r.status} for that recording` });
      const ct = r.headers.get("content-type") || "";
      if (/json/.test(ct)) return res.status(200).json(await r.json());
      // audio comes back as bytes; hand it straight through
      const buf = Buffer.from(await r.arrayBuffer());
      res.setHeader("Content-Type", ct || "audio/mpeg");
      res.setHeader("Cache-Control", "private, max-age=600");
      return res.status(200).send(buf);
    }

    // --- the calls in a window ---
    const from = req.query.from, to = req.query.to;
    if (!from || !to) return res.status(400).json({ error: "Needs from and to, both ISO date-times" });

    // byCreated is when the record landed; the plain route is when the call happened.
    const path = req.query.byCreated ? "/export/calls/byCreated/json" : "/export/calls/json";
    const r = await fetch(`${BASE}${path}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { headers: { Authorization: auth, Accept: "application/json" } });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return res.status(r.status).json({
        error: `Salestrail returned ${r.status}`,
        detail: txt.slice(0, 300),
        hint: r.status === 401 ? "Check SALESTRAIL_PASS. The username on its own will always 401." : "",
      });
    }

    const calls = await r.json();
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

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=600");
    return res.status(200).json({
      ok: true,
      window: { from, to },
      counts: {
        calls: rows.length,
        withRecording: withRec,
        answered: rows.filter(x => x.answered).length,
        advisors: advisors.length,
        totalMinutes: Math.round(rows.reduce((a, x) => a + (x.durationSec || 0), 0) / 60),
      },
      advisors,
      calls: rows,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}

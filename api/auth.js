// api/auth.js — verifies the Google sign-in, checks the allowlist, issues the session,
// and writes a line to the access log.
//
// Environment variables:
//   AUTH_SECRET        any long random string (same one middleware.js uses)
//   GOOGLE_CLIENT_ID   the OAuth client ID
//   ALLOWED_DOMAIN     interviewkickstart.com
//   ALLOWED_EMAILS     theailabdaily@gmail.com,mohitmundhara8@gmail.com
//   GOOGLE_SA_EMAIL / GOOGLE_SA_KEY / SHEET_ID   optional, to write the log to the sheet
//   LOG_TAB            optional, defaults to "Access log"

import crypto from "crypto";

const SESSION_HOURS = 12;

const b64url = (b) => Buffer.from(b).toString("base64")
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function sign(claims, secret) {
  const body = b64url(JSON.stringify(claims));
  const sig = b64url(crypto.createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

function allowed(email) {
  const e = String(email || "").toLowerCase().trim();
  const domain = (process.env.ALLOWED_DOMAIN || "interviewkickstart.com").toLowerCase();
  const extra = String(process.env.ALLOWED_EMAILS || "")
    .split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  if (e.endsWith("@" + domain)) return true;
  return extra.includes(e);
}

// Append a row to the access log. Best effort — a logging failure must never
// stop someone signing in.
async function logAccess(row) {
  const email = process.env.GOOGLE_SA_EMAIL, rawKey = process.env.GOOGLE_SA_KEY,
        sheet = process.env.SHEET_ID;
  if (!email || !rawKey || !sheet) return "not configured";
  try {
    const key = String(rawKey).replace(/\\n/g, "\n").replace(/^["']|["']$/g, "");
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claim = b64url(JSON.stringify({
      iss: email, scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now,
    }));
    const sig = b64url(crypto.createSign("RSA-SHA256").update(`${header}.${claim}`).sign(key));
    const tr = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: `${header}.${claim}.${sig}`,
      }),
    });
    const tj = await tr.json();
    if (!tj.access_token) return "token refused";
    const tab = process.env.LOG_TAB || "Access log";
    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheet}/values/${encodeURIComponent(tab)}!A:F:append` +
      `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: "POST",
        headers: { Authorization: `Bearer ${tj.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [row] }) });
    return r.ok ? "written" : `sheet said ${r.status}`;
  } catch (e) { return "failed: " + String(e.message).slice(0, 60); }
}

export default async function handler(req, res) {
  if (req.method === "GET" && req.query.logout) {
    res.setHeader("Set-Cookie", "cbi_session=; Path=/; Max-Age=0; SameSite=Lax; Secure; HttpOnly");
    return res.status(200).json({ ok: true, signedOut: true });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const secret = process.env.AUTH_SECRET;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!secret) return res.status(500).json({ error: "AUTH_SECRET is not set in Vercel" });
  if (!clientId) return res.status(500).json({ error: "GOOGLE_CLIENT_ID is not set in Vercel" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const credential = body?.credential;
  if (!credential) return res.status(400).json({ error: "No credential in the request" });

  // Let Google verify its own token. Simpler than handling JWKS, and it cannot
  // be got subtly wrong.
  const v = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential));
  const t = await v.json();
  if (!v.ok) return res.status(401).json({ error: "Google could not verify that sign-in" });
  if (t.aud !== clientId) return res.status(401).json({ error: "That sign-in was issued for a different app" });
  if (String(t.email_verified) !== "true") return res.status(401).json({ error: "That Google address is not verified" });

  const email = String(t.email || "").toLowerCase();
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const when = new Date().toISOString();

  if (!allowed(email)) {
    await logAccess([when, email, t.name || "", "DENIED", ip, req.headers["user-agent"] || ""]);
    return res.status(403).json({
      error: `${email} is not on the list. This dashboard is limited to @${process.env.ALLOWED_DOMAIN || "interviewkickstart.com"} addresses and two named exceptions.`,
    });
  }

  const claims = {
    email, name: t.name || "", picture: t.picture || "",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + SESSION_HOURS * 3600,
  };
  const token = sign(claims, secret);
  res.setHeader("Set-Cookie",
    `cbi_session=${token}; Path=/; Max-Age=${SESSION_HOURS * 3600}; SameSite=Lax; Secure; HttpOnly`);

  const logged = await logAccess([when, email, t.name || "", "ALLOWED", ip, req.headers["user-agent"] || ""]);
  return res.status(200).json({ ok: true, email, name: t.name, log: logged });
}

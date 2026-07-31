// api/sheet.js — reads the FDE Live DB straight from Google Sheets.
//
// No libraries. Node's built-in crypto signs the JWT, so there is nothing to
// npm install and nothing to keep updated.
//
// Environment variables to set in Vercel (Settings → Environment Variables):
//   GOOGLE_SA_EMAIL        the service account address, ends in .iam.gserviceaccount.com
//   GOOGLE_SA_KEY          the private_key from the JSON key file, newlines as \n
//   SHEET_ID               1XBqBzpnpemBJVHAt74AQq-1aSHn5A3808YRr-Q0JOQw
//   API_KEY                any long random string you invent, so the endpoint is not open
//
// Then share the Google Sheet with GOOGLE_SA_EMAIL as a Viewer. That is the
// "share the sheet and it has access" step.

import crypto from "crypto";

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let cachedToken = null; // { token, exp }

async function getAccessToken() {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;

  const email = process.env.GOOGLE_SA_EMAIL;
  const key = (process.env.GOOGLE_SA_KEY || "").replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("GOOGLE_SA_EMAIL or GOOGLE_SA_KEY is not set in Vercel");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }));
  const signature = b64url(
    crypto.createSign("RSA-SHA256").update(`${header}.${claim}`).sign(key)
  );

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("Google refused the token: " + JSON.stringify(json));

  cachedToken = { token: json.access_token, exp: Date.now() + (json.expires_in - 120) * 1000 };
  return cachedToken.token;
}

// Sheets returns a grid of values. Turn row 0 into keys.
function toObjects(values, headerRow = 0) {
  if (!values || values.length <= headerRow) return [];
  const head = values[headerRow].map((h) => String(h).trim());
  return values.slice(headerRow + 1).map((row) => {
    const o = {};
    head.forEach((h, i) => { if (h) o[h] = row[i] ?? ""; });
    return o;
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "x-api-key, content-type");
  if (req.method === "OPTIONS") return res.status(204).end();

  // Simple shared-secret gate. Not Fort Knox, but it stops the endpoint being open.
  if (process.env.API_KEY) {
    const given = req.headers["x-api-key"] || req.query.key;
    if (given !== process.env.API_KEY) {
      return res.status(401).json({ error: "Wrong or missing key" });
    }
  }

  const sheetId = req.query.sheet || process.env.SHEET_ID;
  if (!sheetId) return res.status(400).json({ error: "No SHEET_ID configured" });

  // Which tabs to pull. Override with ?tabs=A,B,C
  const tabs = String(req.query.tabs || "FDE Leads,0-5 YOE Tech attendees,Detail5")
    .split(",").map((t) => t.trim()).filter(Boolean);

  // Header row per tab — the 0-5 YOE tab has a title row above its header.
  const headerRows = { "0-5 YOE Tech attendees": 1, "Detail5": 2 };

  try {
    const token = await getAccessToken();
    const ranges = tabs.map((t) => `ranges=${encodeURIComponent(`'${t}'`)}`).join("&");
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet` +
      `?${ranges}&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE` +
      `&dateTimeRenderOption=FORMATTED_STRING`;

    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await r.json();
    if (!r.ok) {
      const msg = data?.error?.message || "Sheets API said no";
      const hint = /permission|not found/i.test(msg)
        ? " — check the sheet is shared with " + process.env.GOOGLE_SA_EMAIL
        : "";
      return res.status(r.status).json({ error: msg + hint });
    }

    const out = {};
    (data.valueRanges || []).forEach((vr, i) => {
      const name = tabs[i];
      out[name] = toObjects(vr.values, headerRows[name] ?? 0);
    });

    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=600");
    return res.status(200).json({
      ok: true,
      fetchedAt: new Date().toISOString(),
      sheetId,
      counts: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])),
      tabs: out,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}

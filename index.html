// api/sheet.js — reads the FDE Live DB straight from Google Sheets.
//
// No libraries. Node's built-in crypto signs the JWT, so there is nothing to
// npm install and nothing to keep updated.
//
// Environment variables to set in Vercel (Settings → Environment Variables):
//   GOOGLE_SA_EMAIL   the service account address, ends .iam.gserviceaccount.com
//   GOOGLE_SA_KEY     the private_key from the JSON key file — paste it however it
//                     comes out, the code below repairs every mangled form
//   SHEET_ID          1XBqBzpnpemBJVHAt74AQq-1aSHn5A3808YRr-Q0JOQw
//   API_KEY           any long random string you invent
//
// Then share the Sheet with GOOGLE_SA_EMAIL as a Viewer. That share is the only
// thing that grants access.
//
// Stuck?  /api/sheet?key=YOUR_API_KEY&debug=1
// It reports the shape of the key without ever printing the key itself.

import crypto from "crypto";

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/* ------------------------------------------------------------------
   Repair the private key.
   Vercel, shells, copy-paste and JSON each mangle PEM newlines in a
   different way, and OpenSSL then throws the useless
   "DECODER routines::unsupported". Every shape below is recovered.
   ------------------------------------------------------------------ */
function normalizeKey(raw) {
  let k = String(raw ?? "").trim();

  // wrapping quotes, sometimes more than one layer
  for (let i = 0; i < 3; i++) {
    if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
      k = k.slice(1, -1).trim();
    } else break;
  }

  // the whole JSON key file got pasted in
  if (k.startsWith("{")) {
    try { const o = JSON.parse(k); if (o.private_key) k = String(o.private_key); } catch {}
  }

  // the whole PEM was base64'd to dodge the newline problem
  if (!/BEGIN [A-Z ]*PRIVATE KEY/.test(k) && /^[A-Za-z0-9+/=\s]+$/.test(k) && k.length > 200) {
    try {
      const d = Buffer.from(k, "base64").toString("utf8");
      if (/BEGIN [A-Z ]*PRIVATE KEY/.test(d)) k = d;
    } catch {}
  }

  // escaped newlines, in every form they arrive in
  k = k.replace(/\\r\\n/g, "\n").replace(/\\\\n/g, "\n").replace(/\\n/g, "\n");
  k = k.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // still one long line: rebuild the PEM from its base64 body
  if (!k.includes("\n")) {
    const m = k.match(/-----BEGIN ([A-Z ]*PRIVATE KEY)-----([\s\S]*?)-----END \1-----/);
    if (m) {
      const body = m[2].replace(/[^A-Za-z0-9+/=]/g, "");
      k = `-----BEGIN ${m[1]}-----\n${(body.match(/.{1,64}/g) || []).join("\n")}\n-----END ${m[1]}-----\n`;
    }
  }

  // header and footer on their own lines, trailing newline present
  k = k.replace(/-----BEGIN ([A-Z ]*PRIVATE KEY)-----[ \t]*\n?/, "-----BEGIN $1-----\n")
       .replace(/\n?[ \t]*-----END ([A-Z ]*PRIVATE KEY)-----[\s]*$/, "\n-----END $1-----\n");
  if (!k.endsWith("\n")) k += "\n";
  return k;
}

/* Describe the key without revealing it, so the diagnostic is safe to screenshot. */
function keyShape(raw) {
  const k = String(raw ?? "");
  const fixed = normalizeKey(k);
  let signs = false, signError = "";
  try { crypto.createSign("RSA-SHA256").update("t").sign(fixed); signs = true; }
  catch (e) { signError = String(e.message).slice(0, 90); }
  return {
    asStored: {
      length: k.length,
      wrappedInQuotes: /^["'][\s\S]*["']$/.test(k.trim()),
      looksLikeWholeJsonFile: k.trim().startsWith("{"),
      hasBeginLine: /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(k),
      hasEndLine: /-----END [A-Z ]*PRIVATE KEY-----/.test(k),
      hasRealNewlines: k.includes("\n"),
      hasLiteralBackslashN: k.includes("\\n"),
      hasCarriageReturns: k.includes("\r"),
      lineCount: k.split("\n").length,
    },
    afterRepair: { lineCount: fixed.split("\n").length, signs, signError },
  };
}

let cachedToken = null;

async function getAccessToken() {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;

  const email = process.env.GOOGLE_SA_EMAIL;
  const rawKey = process.env.GOOGLE_SA_KEY;
  if (!email) throw new Error("GOOGLE_SA_EMAIL is not set in Vercel");
  if (!rawKey) throw new Error("GOOGLE_SA_KEY is not set in Vercel");

  const key = normalizeKey(rawKey);
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }));

  let signature;
  try {
    signature = b64url(crypto.createSign("RSA-SHA256").update(`${header}.${claim}`).sign(key));
  } catch (e) {
    const s = keyShape(rawKey).asStored;
    throw new Error(
      "Could not read the private key. " +
      `It is ${s.length} characters, ` +
      (s.hasBeginLine ? "has a BEGIN line, " : "has NO BEGIN line, ") +
      (s.hasRealNewlines ? `${s.lineCount} lines. ` : "and sits on one line. ") +
      (s.looksLikeWholeJsonFile ? "It looks like the whole JSON file rather than just the private_key value. " : "") +
      (s.wrappedInQuotes ? "It still has quotes around it. " : "") +
      "Open /api/sheet?key=YOUR_API_KEY&debug=1 for the full picture. " +
      "Underlying: " + String(e.message).slice(0, 80)
    );
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${signature}`,
    }),
  });
  const json = await res.json();
  if (!json.access_token) {
    const d = json.error_description || json.error || JSON.stringify(json);
    let hint = "";
    if (/invalid_grant/i.test(d)) hint = " — the key parsed but Google rejected it. Check GOOGLE_SA_EMAIL matches the key file.";
    if (/invalid_client/i.test(d)) hint = " — GOOGLE_SA_EMAIL does not match a real service account.";
    throw new Error("Google refused the token: " + d + hint);
  }

  cachedToken = { token: json.access_token, exp: Date.now() + (json.expires_in - 120) * 1000 };
  return cachedToken.token;
}

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

  if (process.env.API_KEY) {
    const given = req.headers["x-api-key"] || req.query.key;
    if (given !== process.env.API_KEY) {
      return res.status(401).json({ error: "Wrong or missing key" });
    }
  }

  // Safe diagnostic. Never prints the key, only its shape.
  if (req.query.debug) {
    const shaped = process.env.GOOGLE_SA_KEY ? keyShape(process.env.GOOGLE_SA_KEY) : null;
    return res.status(200).json({
      ok: true,
      note: "This never shows the key itself, only its shape. Safe to screenshot.",
      env: {
        GOOGLE_SA_EMAIL: process.env.GOOGLE_SA_EMAIL || "(not set)",
        GOOGLE_SA_KEY: process.env.GOOGLE_SA_KEY ? "(set)" : "(NOT SET)",
        SHEET_ID: process.env.SHEET_ID || "(not set)",
        API_KEY: process.env.API_KEY ? "(set)" : "(not set)",
      },
      privateKey: shaped || "(not set)",
      whatToDo: !shaped
        ? "Set GOOGLE_SA_KEY in Vercel, then redeploy."
        : shaped.afterRepair.signs
          ? "The key is fine. If it still fails, the sheet is almost certainly not shared with the service account yet."
          : "The key cannot be read even after repair. Download a fresh JSON key from Google Cloud and paste the private_key value again.",
    });
  }

  const sheetId = req.query.sheet || process.env.SHEET_ID;
  if (!sheetId) return res.status(400).json({ error: "No SHEET_ID configured" });

  const tabs = String(req.query.tabs || "FDE Leads,0-5 YOE Tech attendees,Detail5")
    .split(",").map((t) => t.trim()).filter(Boolean);
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
        ? ` — share the sheet with ${process.env.GOOGLE_SA_EMAIL} as a Viewer. That share is the only thing that grants access.`
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

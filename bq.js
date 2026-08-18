/* GET /api/sync/bq — live pull from BigQuery.
   Table: ik-marketing-data.India_Leads.FDE_India_live_sheet

   Why this lives on the server: BigQuery needs a service-account private key.
   A key shipped to the browser is a key given away, so the dashboard never
   sees it — it calls this route and gets rows back.

   Read-only. Runs one query, caps its own row count, and returns the rows
   plus the exact SQL it ran so the numbers can always be traced. */

import crypto from "node:crypto";
import { ok, bad, authorised, fetchRetry } from "../_lib.js";

const PROJECT = process.env.BQ_PROJECT || "ik-marketing-data";
const TABLE   = process.env.BQ_TABLE   || "ik-marketing-data.India_Leads.FDE_India_live_sheet";

/* Service-account JWT → access token. No SDK, no dependency to keep current. */
async function accessToken(){
  const raw = process.env.BQ_SA_KEY;
  if(!raw) throw new Error("BQ_SA_KEY not set");
  const key = JSON.parse(raw.trim().startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8"));

  const now = Math.floor(Date.now()/1000);
  const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = b64({ alg:"RS256", typ:"JWT" });
  const body = b64({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/bigquery.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600, iat: now,
  });
  const sig = crypto.createSign("RSA-SHA256").update(`${head}.${body}`).end()
    .sign(key.private_key, "base64url");

  const r = await fetchRetry("https://oauth2.googleapis.com/token", {
    method:"POST",
    headers:{ "content-type":"application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion:`${head}.${body}.${sig}`,
    }),
  });
  if(!r.ok) throw new Error("token exchange failed " + r.status + " " + (await r.text()).slice(0,200));
  return (await r.json()).access_token;
}

/* BigQuery returns everything as strings in a positional array. Turn it back
   into objects using the schema it hands back alongside. */
function shape(schema, rows){
  const cols = (schema?.fields || []).map(f => f.name);
  return (rows || []).map(r => {
    const o = {};
    cols.forEach((c, i) => {
      let v = r.f?.[i]?.v;
      if(v === null || v === undefined) v = "";
      o[c] = v;
    });
    return o;
  });
}

export default async function handler(req, res){
  if(!authorised(req)) return bad(res, 401, "bad or missing x-sync-key");
  if(!process.env.BQ_SA_KEY)
    return bad(res, 503, "BQ_SA_KEY not configured", { setup:"see SETUP_REQUIRED.md" });

  const limit = Math.min(parseInt(req.query.limit || "5000", 10), 20000);
  /* No date filter. The earlier export was filtered from 27 July and silently
     dropped 147 leads, which is what broke reconciliation the first time. */
  const sql = `SELECT * FROM \`${TABLE}\` LIMIT ${limit}`;

  try{
    const tok = await accessToken();
    const r = await fetchRetry(
      `https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT}/queries`,
      { method:"POST",
        headers:{ authorization:`Bearer ${tok}`, "content-type":"application/json" },
        body: JSON.stringify({ query: sql, useLegacySql:false, timeoutMs: 55000, maxResults: limit }) });

    const j = await r.json();
    if(!r.ok || j.error)
      return bad(res, r.status || 502, "bigquery: " + (j.error?.message || r.status), { sql });
    if(!j.jobComplete)
      return bad(res, 504, "query did not finish inside the timeout — narrow it or raise the limit", { sql });

    const rows = shape(j.schema, j.rows);
    return ok(res, {
      table: TABLE,
      sql,
      columns: (j.schema?.fields || []).map(f => f.name),
      count: rows.length,
      totalRows: Number(j.totalRows || rows.length),
      truncated: Number(j.totalRows || 0) > rows.length,
      rows,
    });
  }catch(e){
    return bad(res, 502, "bigquery failed: " + e.message, { sql });
  }
}

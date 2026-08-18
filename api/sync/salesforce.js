/* GET /api/sync/salesforce — SOQL pull, read-only.
   Integration-ready: the moment credentials exist this returns live rows in the
   same shape as the BigQuery adapter, so the dashboard needs no change.

   Objects and fields it expects are documented in SALESFORCE_SETUP.md. */
import { ok, bad, authorised, fetchRetry, putSnapshot } from "../_lib.js";

/* Username-password OAuth flow. Swap for JWT bearer if the org requires it —
   only this function changes. */
async function login(){
  const url = (process.env.SF_LOGIN_URL || "https://login.salesforce.com") + "/services/oauth2/token";
  const r = await fetchRetry(url, {
    method:"POST", headers:{ "content-type":"application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:"password",
      client_id: process.env.SF_CLIENT_ID,
      client_secret: process.env.SF_CLIENT_SECRET,
      username: process.env.SF_USERNAME,
      password: (process.env.SF_PASSWORD||"") + (process.env.SF_TOKEN||""),
    }),
  });
  if(!r.ok) throw new Error("salesforce login failed " + r.status + " " + (await r.text()).slice(0,180));
  return r.json();   // { access_token, instance_url }
}

const SOQL = {
  leads: `SELECT Id, Email, Name, Status, LeadSource, CreatedDate, OwnerId, Owner.Name,
          ConvertedDate, ConvertedOpportunityId FROM Lead
          WHERE CreatedDate = LAST_N_DAYS:120`,
  tasks: `SELECT Id, WhoId, Subject, CallDurationInSeconds, CallType, CallDisposition,
          ActivityDate, CreatedDate, OwnerId, Owner.Name, Description FROM Task
          WHERE CallDurationInSeconds != NULL AND CreatedDate = LAST_N_DAYS:120`,
  opps:  `SELECT Id, Name, StageName, Amount, CloseDate, CreatedDate, OwnerId, Owner.Name,
          ContactId FROM Opportunity WHERE CreatedDate = LAST_N_DAYS:120`,
  history: `SELECT LeadId, Field, OldValue, NewValue, CreatedDate FROM LeadHistory
          WHERE CreatedDate = LAST_N_DAYS:120`,
};

export default async function handler(req, res){
  if(!authorised(req)) return bad(res, 401, "bad or missing x-sync-key");
  if(!process.env.SF_CLIENT_ID)
    return bad(res, 503, "Salesforce not configured", {
      needs:["SF_CLIENT_ID","SF_CLIENT_SECRET","SF_USERNAME","SF_PASSWORD","SF_TOKEN"],
      setup:"see docs/SALESFORCE_SETUP.md" });

  const want = (req.query.objects || "leads,tasks,opps,history").split(",");
  try{
    const { access_token, instance_url } = await login();
    const out = {}, errors = {};
    for(const k of want){
      if(!SOQL[k]) continue;
      const r = await fetchRetry(
        `${instance_url}/services/data/v60.0/query?q=${encodeURIComponent(SOQL[k])}`,
        { headers:{ authorization:`Bearer ${access_token}` } });
      const j = await r.json();
      if(!r.ok){ errors[k] = j[0]?.message || ("HTTP "+r.status); continue }
      out[k] = (j.records||[]).map(x => { const {attributes, ...rest} = x; return rest });
    }
    const stored = await putSnapshot("salesforce", out);
    return ok(res, {
      counts: Object.fromEntries(Object.entries(out).map(([k,v]) => [k, v.length])),
      errors: Object.keys(errors).length ? errors : undefined,
      soql: SOQL, stored, data: out });
  }catch(e){ return bad(res, 502, "salesforce failed: " + e.message) }
}

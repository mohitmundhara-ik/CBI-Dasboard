# Salesforce — exactly what is needed

The adapter is written and deployed at `/api/sync/salesforce`. It is read-only
and returns the same shape as the BigQuery adapter, so nothing in the dashboard
changes when it goes live.

## 1. Connected App (Setup → App Manager → New Connected App)
- Enable OAuth Settings
- Callback URL: `https://<your-vercel-domain>/api/oauth/callback`
- Scopes: **Access and manage your data (api)**, **Perform requests at any time (refresh_token, offline_access)**
- After saving, copy the **Consumer Key** and **Consumer Secret**

## 2. Integration user
Create a dedicated user rather than using a person's login, so access survives
staff changes and can be audited.

Profile/permission set needs:
- **API Enabled**
- **View All Data** on the objects below, or field-level read on each field listed
- No write permissions of any kind — this integration never writes

## 3. Environment variables (Vercel)
```
SF_CLIENT_ID=        # Consumer Key
SF_CLIENT_SECRET=    # Consumer Secret
SF_USERNAME=         # integration user
SF_PASSWORD=         # their password
SF_TOKEN=            # their security token (emailed on password reset)
SF_LOGIN_URL=https://login.salesforce.com   # or https://test.salesforce.com for a sandbox
SYNC_KEY=            # same guard as the other sync routes
```

## 4. Objects and fields read

| Object | Fields | Feeds |
|---|---|---|
| **Lead** | Id, Email, Name, Status, LeadSource, CreatedDate, OwnerId, Owner.Name, ConvertedDate, ConvertedOpportunityId | lead universe, channel, owner, status |
| **Task** (calls only) | Id, WhoId, Subject, CallDurationInSeconds, CallType, CallDisposition, ActivityDate, CreatedDate, OwnerId, Owner.Name, Description | the sales trail — call history, duration, outcome, notes |
| **Opportunity** | Id, Name, StageName, Amount, CloseDate, CreatedDate, OwnerId, Owner.Name, ContactId | conversion, revenue, forecast |
| **LeadHistory** | LeadId, Field, OldValue, NewValue, CreatedDate | the stage-change timeline on the sales trail |

`LeadHistory` requires **field history tracking** switched on for Status (and any
other field you want on the timeline). Without it the trail shows calls and
stages but not who moved what, when.

## 5. Join key
`Lead.Email` maps to the dashboard's `lead_email`. If your HubSpot IDs live in a
custom field instead, name it and the adapter maps that instead — one line.

## 6. Verify
```
curl -H "x-sync-key: $SYNC_KEY" https://<domain>/api/sync/salesforce?objects=leads
```
Returns row counts plus the exact SOQL it ran.

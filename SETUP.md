# CBI Dashboard — setup

Repo: https://github.com/mohitmundhara-ik/CBI-Dasboard
App: https://cbi-dashboard-ik.vercel.app
Sheet: `1XBqBzpnpemBJVHAt74AQq-1aSHn5A3808YRr-Q0JOQw`

---

## Files to commit

```
CBI_Dashboard.html      → rename to index.html in the repo root
middleware.js           → repo root, beside package.json
api/auth.js
api/whoami.js
api/sheet.js
api/salestrail.js
```

No `package.json` changes. Nothing here uses a library.

---

## Environment variables

Vercel → your project → Settings → Environment Variables.

| Name | Value |
|---|---|
| `AUTH_SECRET` | any long random string — signs the session cookie |
| `GOOGLE_CLIENT_ID` | the OAuth client ID from Google Cloud |
| `ALLOWED_DOMAIN` | `interviewkickstart.com` |
| `ALLOWED_EMAILS` | `theailabdaily@gmail.com,mohitmundhara8@gmail.com` |
| `API_KEY` | any long random string — protects the API routes |
| `GOOGLE_SA_EMAIL` | `fde-data@fde-504106.iam.gserviceaccount.com` |
| `GOOGLE_SA_KEY` | the `private_key` value from the service-account JSON |
| `SHEET_ID` | `1XBqBzpnpemBJVHAt74AQq-1aSHn5A3808YRr-Q0JOQw` |
| `SALESTRAIL_USER` | your rotated Salestrail username |
| `SALESTRAIL_PASS` | your rotated Salestrail password |
| `LOG_TAB` | optional, defaults to `Access log` |

**Then redeploy.** Vercel only reads new variables on a fresh build. This is the step people miss.

---

## Google OAuth client

Cloud Console → APIs & Services → Credentials → OAuth client ID → Web application.

**Authorised JavaScript origins**

```
https://cbi-dashboard-ik.vercel.app
```

Exactly that. No trailing slash. If you also run it locally, add `http://localhost:3000`.

Set the **OAuth consent screen** to *Internal* if everyone is on the same Google Workspace — that skips Google's review. If it must be External, add the two Gmail addresses as test users, or the dashboard will refuse them with "app is not verified".

---

## The access log

Create a tab in the sheet called **Access log** with these headers in row 1:

```
Time (UTC) | Email | Name | Result | IP | Browser
```

Every sign-in appends a row, allowed or denied. The service account needs **Editor** on the sheet to write — Viewer is enough for reading the Live DB but not for the log.

If you would rather not give write access, leave `SHEET_ID` out of the auth function's reach and the sign-in still works; only the log stops. Vercel's own function logs will still show every attempt.

---

## How the gate works

`middleware.js` runs before anything is served. No valid session cookie means the dashboard HTML is never sent — the browser gets a sign-in page instead.

This matters. A sign-in screen built into the dashboard would look like security while still shipping every lead name, call recording and revenue figure to anyone who opened the file. The gate has to sit in front.

- Session lasts **12 hours**, then sign in again
- Cookie is `HttpOnly`, `Secure`, `SameSite=Lax` — JavaScript cannot read it, so a script injected into a page cannot steal it
- Cookie is HMAC-signed; editing it invalidates it
- `/api/*` routes skip the gate because they carry their own `API_KEY` check

**Tested:** valid cookie passes, tampered cookie blocked, expired session blocked, wrong Google audience rejected, unverified email rejected, and `attacker@interviewkickstart.com.evil.com` blocked.

---

## Connecting your data

### Google Sheet — set up now

The sheet is already shared with `fde-data@fde-504106.iam.gserviceaccount.com`, so `/api/sheet` reads it with no login and the sheet stays private.

In the dashboard: **Upload data** → *Pull the sheet*.

Check it first at `/api/sheet?key=YOUR_API_KEY&debug=1` — that reports the key's shape without ever showing the key.

### Salesforce — three routes

**A. Through the sheet.** Salesforce report → scheduled export to the Google Sheet → the dashboard reads it. No new code. Refresh is as often as the schedule runs. This is the one to start with.

**B. Connected App + a proxy.** Salesforce Connected App with OAuth, client credentials in Vercel, a `/api/salesforce` route running SOQL. Same shape as `api/salestrail.js`. Live data, half a day's work, and it needs Salesforce admin to create the app.

**C. Power BI.** Point Power BI at `/api/sheet` as a Web source with the `x-api-key` header, or at the Google Sheet directly. Power BI becomes a consumer of the same endpoint rather than a separate pipeline.

Route A now, B when live data actually matters.

---

## If something will not work

**Sign-in popup opens then closes** — the origin is not in Authorised JavaScript origins, character for character.

**"Access blocked: this app is not verified"** — consent screen is External and the address is not a test user. Switch to Internal or add them.

**Signed in, then bounced back to sign-in** — `AUTH_SECRET` differs between `middleware.js` and `api/auth.js`, which happens when it is added to only one environment. Check it is set for Production, Preview and Development.

**`/api/sheet` returns 404** — the file is not deployed. It must sit at exactly `api/sheet.js`.

**500 mentioning `SA_EMAIL` or `SA_KEY`** — variables saved but not redeployed.

**"permission" or "not found" from the sheet** — the sheet is not shared with the service account.

**Salestrail 401** — username and password are a pair. A username from a different account will always 401.

# CBI Dashboard

Central Business Intelligence — Interview Kickstart.

Live at https://cbi-dashboard-ik.vercel.app

Sign-in required. Open to `@interviewkickstart.com` addresses and two named exceptions.

## What it is

A single self-contained HTML file with 22 pages of lead, call and market analysis,
plus four serverless routes that connect it to Google Sheets and Salestrail.

No build step. No framework. `index.html` is the whole front end.

## Structure

```
index.html          the dashboard, self-contained
middleware.js       the sign-in gate, runs before anything is served
vercel.json         headers and caching
api/
  auth.js           verifies Google sign-in, checks the allowlist, writes the access log
  whoami.js         who is signed in, for the header strip
  sheet.js          reads the Live DB from Google Sheets via a service account
  salestrail.js     call log and recordings from Salestrail
```

## Setup

See `SETUP.md`. Short version: commit these files, set the environment variables
in Vercel, **redeploy**, and add the app URL to the OAuth client's authorised origins.

## Rules

Never commit credentials. `.gitignore` blocks `.env` and service-account JSON, but
the real defence is habit — every secret belongs in Vercel's environment variables.

Never commit lead data. Spreadsheets and CSVs are gitignored because they carry
names, phone numbers and call content.

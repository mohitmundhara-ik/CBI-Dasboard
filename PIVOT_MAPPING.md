# Sheet pivot → dashboard → BigQuery → calculation → filters

Source: *FDE Live DB (India) — Call Input Metrics*. Eight pivots, four blocks,
each split Registered | Attended, all cut by `webinar_start_date`.
Rebuilt at **Call input metrics** in the dashboard.

| Sheet pivot | Dashboard | BigQuery fields | Calculation | Filter |
|---|---|---|---|---|
| Total Attempts · Registered | Call input → Total Attempts, left | `webinar_start_date`, `lead_email`, `pre_webinar_attempt`, `post_webinar_attempt` | `COUNT(DISTINCT lead_email)`; `AVG()` each side | has an attempt value |
| Total Attempts · Attended | same, right | + `attended_on` | same | has an attempt value AND `attended_on` not null |
| Total Connected · Registered | Total Connected, left | `pre_webinar_connect`, `post_webinar_connect` | `AVG()` each | has a connect value |
| Total Connected · Attended | same, right | + `attended_on` | same | + attended |
| Total Talktime · Registered | Total Talktime, left | `pre_webinar_tt`, `post_webinar_tt` | `AVG()` each | has a talktime value |
| Total Talktime · Attended | same, right | + `attended_on` | same | + attended |
| Pre Webinar Metrics · both | Pre Webinar Metrics | `pre_webinar_attempt/connect/tt` | `AVG()` each | all leads (right: attended) |
| Post Webinar Metrics · both | Post Webinar Metrics | `post_webinar_attempt/connect/tt` | `AVG()` each | all leads (right: attended) |
| Post Webinar (Attempted) · both | Post Webinar (Attempted) | post fields | `AVG()` each | `post_webinar_attempt > 0` |

**The one interpretation choice.** Each block's `COUNTUNIQUE` differs (544, 204,
313, 845) because each counts only leads holding a value for that measure.
Whether a recorded **0** counts as a value moves every average, so it is a
visible toggle on the page rather than a silent assumption — *"0 means not
called"* against *"0 is a real value"*.

**Validation (item 10) is pending the live connection.** Against the embedded
snapshot the page reads 278 / 240 for Total Attempts · Registered where the
sheet reads 142 / 200. That is not a calculation disagreement: the snapshot
holds 531 leads across two webinars, the sheet 845+ across four (29 Jul, 6 Aug,
13 Aug, 20 Aug). Connect BigQuery and I will match 142 / 200 / 159 / 53 and
grand total 544 exactly, or report which interpretation reproduces them.

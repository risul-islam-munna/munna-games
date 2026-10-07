# Dual Play Push Admin

Static admin page at **`/push-admin/`** (https://games.munna.dev/push-admin/) for sending Dual Play push
notifications through **FCM HTTP v1**. No backend, no database, no stored credentials.

## 1. What it does
Builds a correct FCM v1 message for the three typed intents the app understands (`announcement`, `update`, `game`),
lets you choose an audience (topics / conditions), previews the exact JSON, optionally dry-runs it against Firebase
(`validate_only`), and sends it **now**.

## 2. Static-site security limits
Anyone who finds the URL can load the page (it is `noindex`, unlinked, and not in the sitemap — that is obscurity,
**not authentication**). The only authorization boundary is the Google OAuth access token you paste. The page ships a
Content-Security-Policy that only allows scripts/styles from this origin and network calls to this origin and
`fcm.googleapis.com`.

## 3. Why no frontend password
A username/password in JavaScript is readable by every visitor, so it would be security theatre. Real authorization is
Google's IAM, checked by FCM when you send.

## 4. Never paste a private key
Do not paste a service-account JSON/private key, Firebase Web API key or legacy server key. The page rejects them. Use a
short-lived OAuth access token only.

## 5. OAuth token workflow
Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud`) on a trusted computer.

Option A — your own Google account (must have permission to send FCM messages in the project, e.g. Owner / Firebase
Admin / Firebase Cloud Messaging Admin):
```sh
gcloud auth login
gcloud auth print-access-token
```
Option B — impersonate a service account (no key file ever downloaded; needs the *Service Account Token Creator* role
on it, and the service account needs an FCM sending role):
```sh
gcloud auth print-access-token --impersonate-service-account=SERVICE_ACCOUNT_EMAIL
```
Tokens last about an hour. FCM v1 documents the scope `https://www.googleapis.com/auth/firebase.messaging`; gcloud's
default token carries a broader scope. **Use "Dry run" first** — it proves the token has FCM permission without sending.

Then: open `/push-admin/` → paste token → choose type → audience → title/message → check preview → Dry run →
Review & Send → confirm → **Clear Credential** / close the tab.

## 6–8. Sending each type
* **Announcement** – pick one from the hosted config (`announcements` filtered to Dual Play). Data sent:
  `{v:"1", type:"announcement", announcementId}`. The app resolves content from hosted config; warnings appear if it is
  disabled, expired, not started or not Android. The page never edits config.
* **Update** – data `{v:"1", type:"update"}`. No URL. The app shows the prompt only if hosted config says this build
  should update (build < latest, or below minimum, or `forceUpdate`).
* **Game** – pick a game; sends the canonical `gameId`. Never a route/URL.

Title and message are both required (≤120 / ≤300 chars, matching the app) and become the visible `notification` block;
`android.notification.channel_id` is `dual_play_push`.

## 9–12. Targeting (topics created by the app)
| Audience | FCM target |
|---|---|
| All | topic `all` |
| Country | `country_BD` (device locale region — not GPS/IP/SIM/Play country) |
| Build | `build_<N>` from hosted `versions`/`latestBuildNumber` |
| Country + Build | condition `'country_BD' in topics && 'build_N' in topics` |
| Timezone | `tz_Asia.Dhaka` (`/`→`.`, `+`→`~`; same as `PushTopics.timezone`) |
| Older builds (update only) | `'all' in topics && !('build_<latest>' in topics)` |
| Test device | single FCM registration token |

Several countries/builds/zones OR together inside parentheses. FCM allows **at most 5 topics** per condition; the page
blocks more. The negated "older builds" condition is not covered by the docs I could verify — confirm with Dry run.

## 13. No scheduling
Timezone targeting means "send now to devices in that zone", not "9 AM local". A static page cannot reliably send later.
Scheduling needs a trusted backend/scheduler (e.g. Cloud Scheduler + Cloud Function holding the credential).

## 14. Rollout limitation
Country/build/timezone topics only exist for installs that run a version with topic subscriptions and have launched
once since. Older installs may only be on `all`, and may not understand typed `game`/`update` intents.

## 15. FCM responses
Success: `{"name":"projects/<id>/messages/<id>"}` = *accepted by Firebase*, not delivered. Errors: 400 bad payload/target,
401 bad/expired token, 403 no permission, 404 project/API problem, 429 rate limit, 5xx Firebase error.

## 16. Troubleshooting
* 401 → regenerate the token. 403 → account lacks FCM send permission or the Firebase Cloud Messaging API is disabled.
* 404 → wrong project ID. 400 on "older builds" → negation unsupported; use "Specific build" lists instead.
* "Config unavailable" → `/app-config/*.json` failed to load; nothing is assumed, fix the config.
* Nothing arrives → check the device is subscribed to that topic (launch the updated app), Android notification
  permission, and the `dual_play_push` channel.

## 17. Direct browser send: verified
Checked 2026-10-08 with curl from origin `https://games.munna.dev`: the preflight `OPTIONS` to
`fcm.googleapis.com/v1/projects/dual-play-2026/messages:send` returned 200 with `access-control-allow-origin:
https://games.munna.dev` and allowed `authorization,content-type`; a POST with a bogus token returned a CORS-readable
401. So browser → FCM v1 works. (A real authorized send must still be confirmed manually once.) If this ever breaks, use
**Copy Payload** with a trusted sender (a small Cloud Function behind IAM/Firebase Auth).

## 18. Clearing credentials
**Clear Credential**, reload or close the tab. The token lives only in the input element/JS memory; it is never written to
storage, cookies, URLs or the console, and is wiped when restored from bfcache.

## 19. Production checklist
- [ ] Environment banner says what you expect (both environments share one Firebase project/topics)
- [ ] Type, game/announcement and audience correct in the preview
- [ ] Not `all` unless truly intended
- [ ] Dry run passed
- [ ] Test on your own device first
- [ ] Clear credential afterwards

## Keeping in sync
`push-admin/lib.js` mirrors the Flutter contract (`push_topics.dart`, `push_intent.dart`, `push_channel.dart`) and
`GAMES` mirrors `GameMeta` ids. Update both when the app changes. Tests: `node --test push-admin/tests/lib.test.js`.

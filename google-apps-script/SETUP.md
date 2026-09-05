# Contact form → Google Sheet (with bot protection)

When someone submits the form on `/contact/`, it POSTs to a **Google Apps Script web
app**. The script checks it's human, appends a row to a **Google Sheet**, and emails you.
No third-party service, no server, free.

There are two pieces to set up: **Cloudflare Turnstile** (the "I'm human" check) and the
**Apps Script** (storage + email). Do Turnstile first so you have its keys.

---

## 1. Cloudflare Turnstile (free bot protection)

1. Cloudflare dashboard → **Turnstile** → **Add widget**.
2. Name: `Dual Play contact`. **Hostnames:** add `games.munna.dev` (and `localhost` +
   `munna-games.test` if you want to test locally).
3. Widget mode: **Managed** (recommended).
4. Create. You now have two keys:
   - **Site Key** (public) — goes in the HTML.
   - **Secret Key** (private) — goes in the Apps Script. Never commit this.
5. In [`../contact/index.html`](../contact/index.html) replace
   `REPLACE_ME_TURNSTILE_SITE_KEY` with the **Site Key**.

## 2. Google Sheet

1. Go to <https://sheets.new> — create a blank spreadsheet, name it e.g.
   `Dual Play — contact messages`.
2. That's it. The script creates a `Messages` tab with headers on the first submission.

## 3. Apps Script web app

1. In that spreadsheet: **Extensions → Apps Script**.
2. Delete the sample code. Paste the entire contents of [`Code.gs`](Code.gs).
3. At the top of the file set:
   - `NOTIFY_EMAIL` — the address that should receive new messages (defaults to
     `hello@munna.dev`).
   - `TURNSTILE_SECRET` — the **Secret Key** from step 1.
     *(Leave it as-is to skip Turnstile while testing — the honeypot still runs.)*
4. **Deploy → New deployment** → gear icon → **Web app**.
   - **Description:** `contact form v1`
   - **Execute as:** **Me**
   - **Who has access:** **Anyone**  ← required so the public form can post
5. **Deploy** → authorise when prompted (choose your Google account → *Advanced* →
   *Go to project (unsafe)* → *Allow* — it's your own script).
6. Copy the **Web app URL**. It ends in `/exec`.
7. In [`../contact/index.html`](../contact/index.html) replace the `data-endpoint`
   value (`https://script.google.com/macros/s/REPLACE_ME/exec`) with that URL.

## 4. Test

- Redeploy the site (or test at `http://munna-games.test/contact/`).
- Submit the form. Within a few seconds you should see:
  - a new row in the `Messages` tab, and
  - an email at `NOTIFY_EMAIL` (check spam the first time; add the sender to contacts).
- Open the `/exec` URL directly in a browser — it should say *"Dual Play contact
  endpoint is live."*

## Updating the script later

Edit `Code.gs` in the Apps Script editor, then **Deploy → Manage deployments → edit
(pencil) → Version: New version → Deploy**. The `/exec` URL stays the same.

## How the spam protection works

| Layer | Where | What it stops |
|---|---|---|
| Honeypot `company` field | form + script | Dumb bots that fill every field |
| Minimum fill time (3.5 s) | `assets/site.js` | Instant auto-submits |
| Cloudflare Turnstile | form + script (`siteverify`) | Scripted / headless bots, most abuse |
| Length caps + required checks | form + script | Oversized / junk payloads |

Bad submissions are dropped silently and the visitor still sees a success message, so
bots can't tell what tripped them.

## If you'd rather use a plain Google Form

Simplest possible option, but it won't match the site's design:

1. Create a Google Form (<https://forms.new>) with Name / Email / Subject / Message.
   **Responses → link to Sheets.**
2. **Send → `< >`** (embed) → copy the `<iframe>`.
3. In `../contact/index.html`, delete the whole `<form id="contact-form"> … </form>`
   block and paste the iframe there. You can also remove the Turnstile `<script>` tag
   and the `#contact-form` handler is simply unused.

Google Forms already has its own abuse filtering, so no extra bot protection is needed.

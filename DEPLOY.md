# Deploying `games.munna.dev`

Static site → **GitHub Pages**, with the domain pointed from **Cloudflare** (where the
`munna.dev` zone lives). No build step. ~15 minutes end to end, then ~1 hour for the
HTTPS certificate.

---

## 0. Fill placeholders first

Do the checklist in [`README.md`](README.md#before-you-publish--fill-these-in)
(`REPLACE_ME` / `TODO`). At minimum for a first deploy: the Terms/Privacy dates. The
contact form can be wired up after the site is live — see
[`google-apps-script/SETUP.md`](google-apps-script/SETUP.md).

---

## 1. Push to a new GitHub repo

```sh
cd /Users/munna/Herd/munna-games
git init                       # already done if this is a repo
git add .
git commit -m "Dual Play marketing site"

# create an EMPTY repo on github.com first (e.g. "dualplay-site"), public, no README, then:
git branch -M main
git remote add origin https://github.com/<your-username>/<repo>.git
git push -u origin main
```

- **Public** repo is fine — this is only marketing HTML. (Private repos need GitHub Pro
  for Pages.)
- Nothing here comes from the private `munna_games` app repo.
- `CNAME` (contains `games.munna.dev`) and `.nojekyll` are already in the folder — leave
  them; GitHub Pages uses both.

## 2. Turn on GitHub Pages

1. Repo → **Settings → Pages**.
2. **Build and deployment → Source:** *Deploy from a branch*.
3. **Branch:** `main`, folder `/ (root)` → **Save**.
4. It builds in ~1 minute. Because the repo has a `CNAME` file, the **Custom domain**
   box will already show `games.munna.dev`. (If it doesn't, type it and Save.)
5. Leave **Enforce HTTPS** unchecked *for now* — you can't tick it until DNS resolves and
   GitHub has issued the certificate (step 4 below).

GitHub is now serving the site at `https://<your-username>.github.io/` (it will redirect
to the custom domain once DNS is set).

## 3. Point `games.munna.dev` from Cloudflare

Cloudflare dashboard → select the **`munna.dev`** zone → **DNS → Records → Add record**:

| Field | Value |
|---|---|
| Type | `CNAME` |
| Name | `games` |
| Target | `<your-username>.github.io` |
| Proxy status | **DNS only** (grey cloud) — set this now; you can proxy later |
| TTL | Auto |

> **Why grey cloud first:** GitHub needs to see the real DNS to issue the Let's Encrypt
> certificate for `games.munna.dev`. If you proxy (orange) before that, issuance can get
> stuck. Once GitHub shows the cert as issued you may switch it to orange (step 5).

Save. DNS usually propagates in a couple of minutes on Cloudflare.

## 4. Wait for HTTPS, then lock it in

1. Back on **Settings → Pages**, you'll see *"DNS check successful"* then, after a while,
   *"Your site is published at https://games.munna.dev/"* with a green padlock note.
2. Tick **Enforce HTTPS**.
3. Test:
   - `https://games.munna.dev/`
   - `https://games.munna.dev/about/` · `/contact/` · `/terms/` · `/privacy/`
   - `https://games.munna.dev/robots.txt` · `/sitemap.xml`
   - a made-up path (e.g. `/nope`) → the styled 404 page
   - `http://games.munna.dev/` → redirects to `https://`

## 5. (Optional) Put Cloudflare's CDN in front

Once the GitHub cert is issued and the site loads over HTTPS:

1. DNS → edit the `games` record → Proxy status → **Proxied** (orange cloud).
2. **SSL/TLS → Overview → Full (strict)** for the zone (GitHub's cert is publicly
   trusted, so strict works). *Never use "Flexible"* — it causes redirect loops with
   GitHub Pages.
3. Optional niceties: **Rules → Redirect Rules** for `www`/apex if you ever want them;
   **Speed → Brotli** on; **Caching** standard.

If anything breaks after proxying, flip the record back to grey — the site keeps working
on GitHub's own certificate.

## 6. Contact form (Google Sheet + spam protection)

Follow [`google-apps-script/SETUP.md`](google-apps-script/SETUP.md). Summary:

1. **Cloudflare Turnstile** → Add widget for `games.munna.dev` → get **Site key** +
   **Secret key**.
2. New **Google Sheet** → **Extensions → Apps Script** → paste
   [`google-apps-script/Code.gs`](google-apps-script/Code.gs) → set `NOTIFY_EMAIL` and
   `TURNSTILE_SECRET` → **Deploy → Web app** (*Execute as: Me*, *Access: Anyone*) → copy
   the `/exec` URL.
3. In [`contact/index.html`](contact/index.html): set `data-sitekey` (Turnstile **Site
   key**) and `data-endpoint` (the `/exec` URL). Commit + push.
4. Submit a test message → row appears in the sheet + you get an email.

Protection stack: honeypot field · 3.5 s minimum fill time · Cloudflare Turnstile
server-side check · length caps. Rejected messages are dropped silently.

## 7. Google Search Console

1. Add a property for `games.munna.dev`. Easiest here: **Domain** property → it gives you
   one `TXT` record to add in Cloudflare DNS for `munna.dev`.
2. Submit `https://games.munna.dev/sitemap.xml`.
3. **Rich Results Test** on `/` and `/about/` → expect `MobileApplication`, `FAQPage`,
   `BreadcrumbList`, `Person` with no errors.
4. Check the share card in the Facebook Sharing Debugger / LinkedIn Post Inspector.

## 8. Google Play Console

- **App content → Privacy policy** → `https://games.munna.dev/privacy/`
- **App content → Data safety** — match `privacy/index.html`: App activity + App
  info/performance (analytics + crash logs via Firebase); Device or other IDs
  (advertising via AdMob); not linked to identity by you; not sold.
- Store listing → website: `https://games.munna.dev/`

## 9. After the app is live on Play

- Set the real Play Store URL on every "Get on Google Play" button (all pages) and on the
  JSON-LD `installUrl` in `index.html`; remove the `aria-disabled` attribute.
- `git commit` + `git push` — GitHub Pages redeploys automatically in ~1 minute.

---

### Deploying updates from now on

```sh
cd /Users/munna/Herd/munna-games
git add -A && git commit -m "…" && git push
```

GitHub Pages rebuilds on every push to `main`.

### Alternatives (not needed, for reference)

- **Cloudflare Pages** — connect the same repo, framework preset *None*, no build
  command, output dir `/`; add `games.munna.dev` under Custom domains (DNS auto-added
  since the zone is on Cloudflare). Slightly faster global edge than GitHub Pages.
- **Netlify** — <https://app.netlify.com/drop>, drag the folder, add the custom domain.
- **Google Sites** — can't host these files; only ~10 KB sandboxed HTML embeds. You'd
  rebuild every page by hand and lose `<head>` SEO control. Not recommended for a Play
  Store launch.

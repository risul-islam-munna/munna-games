# Dual Play — marketing site (`games.munna.dev`)

Static marketing + legal site for the **Dual Play** Android game app. Plain HTML/CSS/JS —
no build step, no framework, no dependencies to install. Deploy the folder as-is.

This repo is **separate from the app's source code** on purpose. It contains only public
marketing content and can live in a public repo.

## Pages

| File | URL | Purpose |
|---|---|---|
| `index.html` | `/` | Landing page — hero, games, features, how Wi-Fi play works, FAQ |
| `about/index.html` | `/about/` | About the app and the developer |
| `contact/index.html` | `/contact/` | Contact form + email + socials |
| `terms/index.html` | `/terms/` | Terms & Conditions |
| `privacy/index.html` | `/privacy/` | Privacy Policy — **use this URL in Google Play Console** |
| `404.html` | (host 404) | Friendly not-found page |

Shared assets: `assets/site.css`, `assets/site.js`, icons, `assets/og-cover.png`.
SEO plumbing: `sitemap.xml`, `robots.txt`, `site.webmanifest`, per-page canonical +
Open Graph + Twitter tags + JSON-LD.
Hosting helpers: `CNAME` (GitHub Pages custom domain), `.nojekyll` (skip Jekyll).

The Contact page is email + social links only — no form, nothing to configure.

## Local preview

The folder is already served by Laravel Herd at **`https://munna-games.test/`**.
Any static server works too, e.g. `python3 -m http.server` from this directory
(then browse `http://localhost:8000/`).

Links use root-absolute paths (`/about/`, `/assets/...`), so preview from a server —
not by double-clicking the HTML files.

## Before you publish — fill these in

Search the project for `REPLACE_ME` and `TODO`. The list:

1. **Google Play link.** Every "Get on Google Play" button uses `href="#"` with
   `aria-disabled="true"`. Once the listing is live, set `href` to the Play URL and remove
   `aria-disabled`. Also update `installUrl` in the JSON-LD block in `index.html`.
2. *(nothing — the Contact page is a `mailto:` link + socials, no backend.)*
3. **Effective dates.** `terms/index.html` and `privacy/index.html` both show
   `6 September 2026` — change to the real publication date.
4. **Minimum Android version.** `index.html` FAQ has a `TODO` for the exact minimum
   Android/API level (from the app's `build.gradle.kts`).
5. **Target audience / Families.** `privacy/index.html` §10 has a `TODO` to align the
   children's-privacy wording with your Play Console "Target audience and content" answers.
6. **Social share image.** `assets/og-cover.png` is a generated placeholder. Replace it
   with a 1200×630 image using a real app screenshot when you have store assets. Keep the
   filename or update the `og:image` / `twitter:image` URLs on all pages.
7. *(Optional)* **Site analytics.** No analytics script is included. If you want one, add
   it in each page's `<head>`. Use a property that's separate from the portfolio's.

## Content source of truth

App facts (games, modes, bot tiers, Wi-Fi/voice behaviour, "no account", ads + Firebase)
were taken from the Dual Play codebase. Developer facts (name, role, Bee Hook, links) come
from the portfolio at <https://munna.dev>. Keep both in sync if the app or bio changes.

## Deploy

See [`DEPLOY.md`](DEPLOY.md).

# games.munna.dev — games by Risul Islam Munna

Static site for **games.munna.dev**: a hub landing page plus a self-contained marketing +
legal site for each game. Plain HTML/CSS/JS — no build step, no framework, no
dependencies. Deploy the folder as-is.

Separate from any app's source code — this repo is only public marketing content.

## Structure

```
/                       hub — lists the games, principles, developer
  index.html
  assets/               ONE shared design system (site.css, site.js, favicon, icons, hub og-cover)
  404.html  robots.txt  sitemap.xml  site.webmanifest  CNAME  .nojekyll

/dual-play/             one game = one folder, fully self-contained
  index.html            landing
  about/index.html
  contact/index.html    email + socials (no form)
  terms/index.html
  privacy/index.html    ← this URL goes in Google Play Console
  assets/og-cover.png   game-specific share image
  site.webmanifest
```

| URL | Purpose |
|---|---|
| `/` | Hub — game grid, principles, developer |
| `/dual-play/` | Dual Play landing (hero, games, features, Wi-Fi, FAQ) |
| `/dual-play/about/` | About the app + developer |
| `/dual-play/contact/` | Email + social links |
| `/dual-play/terms/` | Terms & Conditions |
| `/dual-play/privacy/` | **Privacy Policy — the Play Console URL** |

SEO plumbing on every page: canonical + Open Graph + Twitter + JSON-LD, plus
`sitemap.xml` / `robots.txt` / `site.webmanifest` at the root.

## Adding a new game

1. `cp -r dual-play <new-game>` (or copy the parts you need).
2. Find-and-replace inside `<new-game>/`: `dual-play` → `<new-game>`, and the Dual Play
   copy/branding with the new game's.
3. Update canonical / `og:url` / JSON-LD `@id`s to `https://games.munna.dev/<new-game>/…`.
4. Add a card to the hub `index.html` (`#games` grid) and a row to `sitemap.xml`.
5. Give it its own `assets/og-cover.png` and `site.webmanifest`.

The shared look comes from `/assets/site.css`; per-game accent colours are just a
`--ga` custom property on the game card.

## Local preview

Served by Laravel Herd at **`https://munna-games.test/`**. Any static server works too
(`python3 -m http.server` from this directory). Links are root-absolute, so preview from a
server — not by opening files directly.

## Before Dual Play goes to the Play Store — fill these in

Search `dual-play/` for `TODO`:

1. **Google Play link.** Every "Get on Google Play" button is `href="#"` +
   `aria-disabled="true"`. Set the real URL and drop `aria-disabled`; also update
   `installUrl` in the JSON-LD in `dual-play/index.html`.
2. **Effective dates.** `dual-play/terms/index.html` and `dual-play/privacy/index.html`
   show `6 September 2026` — set the real publication date.
3. **Minimum Android version.** `dual-play/index.html` FAQ has a `TODO` for the exact
   minimum Android/API level.
4. **Target audience / Families.** `dual-play/privacy/index.html` §10 `TODO` — align with
   the Play Console "Target audience and content" answers.
5. **Share image.** `dual-play/assets/og-cover.png` is generated art — swap for one with a
   real screenshot when store assets exist.
6. *(Optional)* site analytics — no script is included; add one in `<head>` if wanted,
   using a property separate from the portfolio's.

## Deploy

See [`DEPLOY.md`](DEPLOY.md). Live on GitHub Pages at `games.munna.dev`; domain via
Cloudflare DNS.

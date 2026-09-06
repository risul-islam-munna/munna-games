# `games.munna.dev` — hosted app config

This folder lives at the root of the **`games.munna.dev`** site repo and
publishes at:

```
https://games.munna.dev/app-config/config.json
https://games.munna.dev/app-config/img/<your images>
```

Drop announcement images into `img/` and reference them by that full URL.

The Dual Play app fetches `config.json` on **every launch** (see the Flutter
repo's `app/lib/game_catalog.dart` → `kRemoteConfigUrl`) and syncs it into a
small on-device database. No app release is needed to change announcements or
push a force-update — just edit `config.json` (and the images beside it) and
commit; GitHub Pages redeploys the site.

Serve it as `Content-Type: application/json`. GitHub Pages, Cloudflare Pages and
Netlify all do this automatically for a `.json` file.

## `config.json` shape

### `apps` — one entry per game, keyed by its app key

| field | meaning |
|---|---|
| `androidAppId` / `iosAppId` | package / bundle ids (for reference + targeting) |
| `minSupportedVersion` | build below this ⇒ **blocking** update dialog |
| `latestVersion` | build below this (but ≥ min) ⇒ dismissible "update available" |
| `forceUpdate` | `true` ⇒ block regardless of version numbers |
| `androidUpdateUrl` / `iosUpdateUrl` | store link the "Update now" button opens |

The running app knows its own key (`kAppKey`, currently `dualplay`), version
(`kAppVersion`) and platform, and picks its own entry.

#### `platform` targeting

`platform` narrows an announcement to one OS. Use it for store-specific asks
("rate us on Google Play"), a message about a build that only exists on one
platform, or anything whose wording is wrong on the other store.

| value | seen by |
|---|---|
| `"all"` (or omitted, or `["android", "ios"]`) | every install |
| `"android"` | Android installs only |
| `"ios"` | iOS installs only |

A single-element list (`["android"]`) works too; unknown values fall back to
`"all"`. Filtering happens on the device at sync time against
`defaultTargetPlatform`, so an off-platform announcement is never even stored.
`platform` and `audience` are **AND**ed — an item must match both.

### `announcements` — a flat list; each item is targeted and scheduled

| field | default | meaning |
|---|---|---|
| `id` | — (required) | stable id; impression counting is per id, per device |
| `audience` | `["*"]` | `["*"]` = every app, or a list of app keys / app ids |
| `platform` | `"all"` | `"all"`, `"android"` or `"ios"` — which OS sees it |
| `title` / `body` / `imageUrl` | — | content (needs at least one) |
| `linkUrl` / `linkLabel` | — | optional button that opens a URL |
| `priority` | `0` | higher wins when several are eligible at once |
| `startAt` | now | ISO-8601 UTC; not shown before this |
| `expireAt` | never | ISO-8601 UTC; not shown after this, then auto-deleted on-device |
| `maxImpressions` | `1` | show at most this many times, ever, on a device |
| `minIntervalHours` | `0` | minimum gap between two showings on a device |

## How the device handles it

On each launch, when there is connectivity, `RemoteConfigService.sync()`:

1. Fetches `config.json` (time-boxed to 4 s; the last good copy stands if it
   fails).
2. Keeps only announcements whose `audience` **and** `platform` match this
   install.
3. Merges them into the on-device DB (`SharedPreferences`), **preserving**
   per-announcement impression counts and last-shown time.
4. Downloads each `imageUrl` into an offline image cache
   (`<cache>/announcement_images/`).
5. Deletes local entries + cached images that the server removed, or that are
   past `expireAt` + 7 days, keeping at most the 50 newest.

Offline launches skip step 1 and use whatever was last synced — so an
announcement authored today is shown (image and all) when the user opens the
app offline tomorrow.

The lobby shows, in order: force-update → optional-update nudge → the single
highest-priority eligible announcement → any FCM message that arrived while the
app was closed.

## Testing

- **Force-update:** set `apps.dualplay.minSupportedVersion` above `kAppVersion`
  and relaunch → blocking dialog.
- **Announcement:** add an item with a new `id`, `startAt` in the past → it
  appears once (or `maxImpressions` times, `minIntervalHours` apart).
- **Offline image:** launch once online, kill the app, go offline, relaunch →
  the announcement still renders with its image.
- **Cleanup:** remove an item from `config.json` → it disappears on the next
  online launch and its cached image is deleted.

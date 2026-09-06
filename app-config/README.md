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
| `regions` | `["*"]` | ISO-3166 country codes (`["US"]`); matched against the device region. See below |
| `trigger` | `"launch"` | `"launch"` = shown on the schedule below; `"push"` = only when an FCM message references it. See below |
| `title` / `body` / `imageUrl` | — | content (needs at least one) |
| `linkUrl` / `linkLabel` | — | optional button that opens a URL |
| `priority` | `0` | higher wins when several are eligible at once |
| `startAt` | now | ISO-8601 **UTC** instant; not shown before this — same moment worldwide |
| `expireAt` | never | ISO-8601 UTC instant; not shown after this, then auto-deleted on-device |
| `startAtLocal` | — | zone-**less** wall-clock (`2026-09-10T15:00`); not shown before this time *in the device's own timezone* |
| `expireAtLocal` | — | zone-less wall-clock; not shown after this time in the device's own timezone |
| `maxImpressions` | `1` | show at most this many times, ever, on a device |
| `minIntervalHours` | `0` | minimum gap between two showings on a device |

All of `audience`, `platform`, `regions`, `trigger`, and every date bound are
**AND**ed — an item shows only when it passes them all. When both a UTC bound
and its `…Local` twin are set, both must have passed.

### `regions` targeting

`regions` restricts an announcement to devices whose **region setting** is in
the list (ISO-3166, case-insensitive). It's the phone's locale region, not a GPS
fix — good enough to target "US users", and it needs no permission. A device
whose locale carries no country only matches `["*"]`.

### Timezone & local scheduling

`startAt` / `expireAt` are absolute instants: set `startAt` and everyone on
Earth sees the item the same second. That's usually not what "show it at 3 pm"
means.

`startAtLocal` / `expireAtLocal` are **wall-clock** times with no zone. Each
device compares them against its own clock, so every timezone crosses 3 pm at
its own moment. (A stray `Z` or `+05:30` on these fields is stripped — they are
local by definition.)

**Example — "show USA users this on 10 Sep 2026 at 15:00 their local time":**

```json
{
  "id": "usa-launch-2026-09-10",
  "audience": ["dualplay"],
  "regions": ["US"],
  "startAtLocal": "2026-09-10T15:00",
  "expireAt": "2026-09-24T00:00:00Z"
}
```

A phone in Bangladesh never matches `regions`, so you (the author) don't see it.
A phone in New York shows it at 15:00 America/New_York; one in Los Angeles at
15:00 America/Los_Angeles.

Want one **simultaneous** nationwide moment instead (e.g. 3 pm Eastern = noon
Pacific)? Bake the offset into an absolute `startAt` and keep `regions`:

```json
{ "regions": ["US"], "startAt": "2026-09-10T15:00:00-04:00" }
```

### `trigger` — show only when a push arrives

`trigger: "push"` items are synced and stored like any other, but the launch
gate skips them. They appear **only** when an FCM message names them, so the
push payload can be tiny — the title/body/image/link all live here in
`config.json`:

```jsonc
// FCM message (Firebase console → Cloud Messaging, or the send API)
// Topic: "all"   (everyone is subscribed)
{
  "data": { "announcementId": "flash-sale-remove-ads" }
}
```

When that message lands (foreground, or a tapped notification), the app looks
`flash-sale-remove-ads` up in the synced set and shows its modal. De-duping is
per FCM message, so re-sending the same `announcementId` next week shows it
again; `maxImpressions` still caps a single burst. If the id isn't synced yet
(device hasn't fetched the new `config.json`), the app falls back to whatever
`title` / `body` / `imageUrl` you also put in the message's `data`.

Use it for genuinely time-critical, "right now" moments (a flash sale, a live
event starting) where a scheduled launch gate is too slow or too early.

## How the device handles it

On each launch, when there is connectivity, `RemoteConfigService.sync()`:

1. Fetches `config.json` (time-boxed to 4 s; the last good copy stands if it
   fails).
2. Keeps only announcements whose `audience`, `platform` **and** `regions` match
   this install (a `trigger: "push"` item is kept too, but held back for the
   push path).
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
highest-priority eligible **launch** announcement → any FCM message (an inline
one, or a `trigger: "push"` item resolved by `announcementId`).

## Testing

- **Force-update:** set `apps.dualplay.minSupportedVersion` above `kAppVersion`
  and relaunch → blocking dialog.
- **Announcement:** add an item with a new `id`, `startAt` in the past → it
  appears once (or `maxImpressions` times, `minIntervalHours` apart).
- **Offline image:** launch once online, kill the app, go offline, relaunch →
  the announcement still renders with its image.
- **Cleanup:** remove an item from `config.json` → it disappears on the next
  online launch and its cached image is deleted.
- **`regions`:** set `regions` to a country you're *not* in → the item never
  appears for you; set it to your own → it does.
- **`startAtLocal`:** set it a few minutes ahead → nothing; relaunch after that
  minute passes → it appears, and it would appear at that same wall-clock time
  in any other timezone.
- **`trigger: "push"`:** it should *not* appear on launch. Send an FCM message
  to topic `all` with `data.announcementId` set to its id → the modal appears.

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

`audience`, `platform`, `regions` and every date bound are **AND**ed — an item
reaches a device only when it passes them all, and when both a UTC bound and its
`…Local` twin are set, both must have passed. `trigger` doesn't filter *whether*
a device gets the item, only *how* it surfaces (feed on sync vs. feed + nudge on
push).

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
`flash-sale-remove-ads` up in the synced set, marks it **unread**, and drops a
dismissible snackbar that points at the feed. De-duping is per FCM message, so
re-sending the same `announcementId` next week notifies again. If the id isn't
synced yet (device hasn't fetched the new `config.json`) it falls back to
whatever `title` / `body` / `imageUrl` you also put in the message's `data`,
otherwise it just waits for the next sync to pick the item up.

Use it for genuinely time-critical, "right now" moments (a flash sale, a live
event starting) where waiting for the next app launch is too slow.

## How the player sees announcements

**Nothing interrupts the app.** There is no launch modal. Announcements live in
an in-app **"What's New"** feed, opened from the drawer:

- The drawer's menu button and its "What's New" row show an **unread badge**
  while there are items the player hasn't opened.
- Opening the feed lists every current announcement (newest / highest priority
  first), image and all, and clears the badge.
- A `linkUrl` opens in an **in-app browser tab** (Android Custom Tabs / iOS
  `SFSafariViewController`) — the player never leaves the app for the standalone
  browser.
- Items are never deleted by the player; they clear themselves on `expireAt`
  (this is unchanged).

The only things that still take over the screen are the **force-update** (rare,
intentional) and **optional-update** dialogs.

## What the device does on each launch

When there is connectivity, `RemoteConfigService.sync()`:

1. Fetches `config.json` (time-boxed to 4 s; the last good copy stands if it
   fails).
2. Keeps only announcements whose `audience`, `platform` **and** `regions` match
   this install. `trigger: "push"` items are kept too — they're just held out of
   the launch snackbar until an FCM message names them.
3. Merges them into the on-device DB (`SharedPreferences`), **preserving**
   per-announcement impression / read state.
4. Downloads each `imageUrl` into an offline image cache
   (`<cache>/announcement_images/`).
5. Deletes local entries + cached images that the server removed, or that are
   past `expireAt` + 7 days, keeping at most the 50 newest.
6. Recomputes the unread count that drives the drawer badge.

Offline launches skip step 1 and use whatever was last synced — the feed and the
badge still work.

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
- **Feed:** add an item with a new `id`, `startAt` in the past → the drawer
  shows an unread badge; opening "What's New" lists it and clears the badge.
- **`trigger: "push"`:** it should *not* raise the badge on its own. Send an FCM
  message to topic `all` with `data.announcementId` set to its id → the badge
  lights and a "View" snackbar appears.

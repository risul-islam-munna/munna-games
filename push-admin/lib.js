// Dual Play Push Admin — pure logic (no DOM, no network, no storage).
//
// Everything here is deterministic so it can be unit-tested with `node --test`.
// The OAuth token never passes through this module except `validateToken`,
// which only inspects it and returns a verdict.
//
// Contract source of truth (Flutter repo, packages/game_core/lib/src/push/):
//   push_topics.dart  – topic names (country_XX, build_N, tz_<iana . and ~>)
//   push_intent.dart  – data keys: v, type, announcementId, gameId,
//                       minBuild, maxBuild, regions; limits title 120 / body 300
//   push_channel.dart – Android channel id `dual_play_push`

export const CONTRACT = Object.freeze({
  version: '1',
  types: ['announcement', 'update', 'game'],
  channelId: 'dual_play_push',
  allTopic: 'all',
  limits: Object.freeze({ title: 120, body: 300, id: 128, gameId: 40, buildDigits: 9, regionsMax: 50 }),
  /** FCM: "You can include up to five topics in your conditional expression." */
  maxConditionTopics: 5,
});

export const SUPPORTED_APPS = Object.freeze({
  dualplay: { key: 'dualplay', label: 'Dual Play', androidAppId: 'dev.munna.games.dualplay' },
});

export const DEFAULT_PROJECT_ID = 'dual-play-2026'; // public: google-services.json

export const ENVIRONMENTS = Object.freeze({
  production: { key: 'production', label: 'Production', configUrl: '/app-config/config.json' },
  development: { key: 'development', label: 'Development', configUrl: '/app-config/dev-config.json' },
});

/** Game metadata mirrored from the Flutter GameMeta ids/titles. Keep in sync. */
export const GAMES = Object.freeze([
  { id: 'tictactoe', name: 'Tic Tac Toe' },
  { id: 'four_in_a_row', name: 'Four in a Row' },
  { id: 'ludo', name: 'Ludo' },
  { id: 'dotsandboxes', name: 'Dots and Boxes' },
  { id: 'baghbandi', name: 'Bagh-Bandi' },
  { id: 'sholo_guti', name: 'Sholo Guti' },
  { id: 'wallblock', name: 'Wall Block' },
  { id: 'memory_match', name: 'Memory Match' },
  { id: 'shape_crack', name: 'Shape Crack' },
]);

// ---------------------------------------------------------------- topics ---
// Exact ports of PushTopics in push_topics.dart.

const FCM_SAFE = /^[a-zA-Z0-9\-_.~%]{1,200}$/;

export function countryTopic(code) {
  const c = typeof code === 'string' ? code.trim() : '';
  return /^[A-Za-z]{2}$/.test(c) ? `country_${c.toUpperCase()}` : null;
}

export function buildTopic(n) {
  const num = typeof n === 'string' && /^\d+$/.test(n) ? Number(n) : n;
  return Number.isInteger(num) && num > 0 ? `build_${num}` : null;
}

export function timezoneTopic(iana) {
  const id = typeof iana === 'string' ? iana.trim() : '';
  if (!id || id.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(id)) return null;
  const topic = `tz_${id.replaceAll('/', '.').replaceAll('+', '~')}`;
  return FCM_SAFE.test(topic) ? topic : null;
}

// ---------------------------------------------------------------- config ---

export class ConfigError extends Error {}

const isPosInt = (v) => Number.isInteger(v) && v > 0;

/**
 * Validates the hosted config and extracts what the admin needs for one app.
 * Throws ConfigError with a human-readable message; never guesses a build.
 */
export function parseConfig(raw, appKey = 'dualplay') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ConfigError('Config is not a JSON object.');
  const app = raw.apps?.[appKey];
  if (!app || typeof app !== 'object') throw new ConfigError(`Config has no "${appKey}" app entry.`);
  if (!isPosInt(app.latestBuildNumber)) throw new ConfigError('apps.' + appKey + '.latestBuildNumber is missing or not a positive integer.');
  const min = app.minSupportedBuildNumber;
  if (min !== undefined && !isPosInt(min)) throw new ConfigError('minSupportedBuildNumber is not a positive integer.');

  const versionMap = {};
  if (app.versions !== undefined) {
    if (typeof app.versions !== 'object' || Array.isArray(app.versions) || app.versions === null) {
      throw new ConfigError('versions must be an object of build → version name.');
    }
    for (const [k, v] of Object.entries(app.versions)) {
      if (!/^\d+$/.test(k) || Number(k) <= 0) throw new ConfigError(`versions has an invalid build key "${k}".`);
      versionMap[Number(k)] = String(v);
    }
  }
  const latest = app.latestBuildNumber;
  const buildNumbers = [...new Set([...Object.keys(versionMap).map(Number), latest])].sort((a, b) => b - a);
  const builds = buildNumbers.map((n) => ({
    build: n,
    version: versionMap[n] ?? null,
    label: versionMap[n] ? `Build ${n} — v${versionMap[n]}` : `Build ${n}`,
  }));

  const list = raw.announcements ?? [];
  if (!Array.isArray(list)) throw new ConfigError('announcements must be an array.');
  const announcements = list
    .filter((a) => a && typeof a === 'object' && typeof a.id === 'string' && a.id)
    .filter((a) => !Array.isArray(a.audience) || a.audience.includes(appKey));

  return {
    appKey,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    latestBuild: latest,
    minSupportedBuild: min ?? null,
    forceUpdate: app.forceUpdate === true,
    latestVersion: versionMap[latest] ?? null,
    builds,
    announcements,
  };
}

/** Eligibility warnings for an announcement, mirroring what the app filters on. */
export function announcementStatus(a, now = new Date()) {
  const warnings = [];
  if (a.enabled === false) warnings.push('Disabled (enabled: false) — the app will ignore it.');
  const start = a.startAt ? new Date(a.startAt) : null;
  const end = a.expireAt ? new Date(a.expireAt) : null;
  if (start && !Number.isNaN(+start) && start > now) warnings.push(`Not started yet (starts ${a.startAt}).`);
  if (end && !Number.isNaN(+end) && end <= now) warnings.push(`Expired (${a.expireAt}).`);
  if (a.platform && !['android', 'all'].includes(a.platform)) warnings.push(`Platform is "${a.platform}", not Android.`);
  let status = 'Active';
  if (a.enabled === false) status = 'Disabled';
  else if (end && end <= now) status = 'Expired';
  else if (start && start > now) status = 'Scheduled';
  return { status, warnings, ok: warnings.length === 0 };
}

// -------------------------------------------------------------- audience ---

/**
 * audience = {
 *   mode: 'all'|'country'|'build'|'country_build'|'timezone'|'country_timezone'
 *         |'older_builds'|'custom'|'device',
 *   countries: string[], builds: number[], timezones: string[],
 *   deviceToken?: string, latestBuild?: number
 * }
 * Returns { ok, errors, target: {topic}|{condition}|{token}, topics, label,
 *           broad, conditionText }.
 */
export function buildAudience(aud, ctx = {}) {
  const errors = [];
  const mode = aud?.mode;
  const countries = [...new Set((aud?.countries ?? []).map((c) => String(c).toUpperCase()))];
  const builds = [...new Set((aud?.builds ?? []).map(Number))];
  const timezones = [...new Set(aud?.timezones ?? [])];

  const usesCountry = ['country', 'country_build', 'country_timezone', 'custom'].includes(mode);
  const usesBuild = ['build', 'country_build', 'custom'].includes(mode);
  const usesTz = ['timezone', 'country_timezone', 'custom'].includes(mode);

  const out = { ok: false, errors, target: null, topics: [], label: '', broad: false, conditionText: null };

  if (mode === 'all') {
    return { ...out, ok: true, target: { topic: CONTRACT.allTopic }, topics: ['all'], label: 'All subscribed users', broad: true };
  }

  if (mode === 'device') {
    const t = String(aud.deviceToken ?? '').trim();
    if (!/^[A-Za-z0-9_:\-.]{100,400}$/.test(t)) errors.push('Enter a valid FCM registration token (copy it from a debug build log).');
    return { ...out, ok: errors.length === 0, errors, target: errors.length ? null : { token: t }, label: 'Single test device', topics: [] };
  }

  const groups = []; // each: array of topic names OR'd together
  const labels = [];

  if (mode === 'older_builds') {
    const latest = ctx.latestBuild;
    const topic = buildTopic(latest);
    if (!topic) errors.push('Latest build is unknown — load the config first.');
    else {
      const condition = `'${CONTRACT.allTopic}' in topics && !('${topic}' in topics)`;
      return {
        ...out, ok: true, target: { condition }, topics: ['all', topic],
        label: `Everyone except build ${latest}`, conditionText: condition, broad: true,
      };
    }
    return out;
  }

  if (!['country', 'build', 'country_build', 'timezone', 'country_timezone', 'custom'].includes(mode)) {
    errors.push('Choose an audience.');
    return out;
  }

  if (usesCountry) {
    const topics = [];
    for (const c of countries) {
      const t = countryTopic(c);
      if (!t) errors.push(`Invalid country code "${c}".`);
      else topics.push(t);
    }
    if (!topics.length && !errors.length && mode !== 'custom') errors.push('Select at least one country.');
    if (topics.length) { groups.push(topics); labels.push(countries.join(' / ')); }
  }
  if (usesBuild) {
    const topics = [];
    for (const b of builds) {
      const t = buildTopic(b);
      if (!t) errors.push(`Invalid build "${b}".`);
      else if (ctx.knownBuilds && !ctx.knownBuilds.includes(b)) errors.push(`Build ${b} is not in the hosted config.`);
      else topics.push(t);
    }
    if (!topics.length && !errors.length && mode !== 'custom') errors.push('Select at least one build.');
    if (topics.length) { groups.push(topics); labels.push(`Build ${builds.join(' / ')}`); }
  }
  if (usesTz) {
    const topics = [];
    for (const z of timezones) {
      const t = timezoneTopic(z);
      if (!t) errors.push(`Invalid timezone "${z}".`);
      else topics.push(t);
    }
    if (!topics.length && !errors.length && mode !== 'custom') errors.push('Select at least one timezone.');
    if (topics.length) { groups.push(topics); labels.push(timezones.join(' / ')); }
  }

  if (mode === 'custom' && groups.length === 0 && !errors.length) errors.push('Choose at least one country, build or timezone.');

  const all = groups.flat();
  if (all.length > CONTRACT.maxConditionTopics) {
    errors.push(`Too many topics (${all.length}). FCM conditions allow at most ${CONTRACT.maxConditionTopics}.`);
  }
  if (errors.length) return out;

  out.topics = all;
  out.label = labels.join(' + ');
  if (all.length === 1) {
    out.target = { topic: all[0] };
  } else {
    const expr = groups
      .map((g) => (g.length === 1 ? `'${g[0]}' in topics` : `(${g.map((t) => `'${t}' in topics`).join(' || ')})`))
      .join(' && ');
    out.target = { condition: expr };
    out.conditionText = expr;
  }
  out.ok = true;
  return out;
}

export function describeTarget(audience) {
  if (!audience.ok) return '';
  const t = audience.target;
  if (t.topic) return t.topic;
  if (t.condition) return t.condition;
  return 'device token';
}

// --------------------------------------------------------------- payload ---

const ID_RE = /^[^\x00-\x1F\x7F]+$/;

export function validateGates(g = {}) {
  const errors = [];
  const data = {};
  const num = (key) => {
    const raw = String(g[key] ?? '').trim();
    if (!raw) return null;
    if (!/^\d+$/.test(raw) || raw.length > CONTRACT.limits.buildDigits || Number(raw) <= 0) {
      errors.push(`${key} must be a positive whole number.`);
      return null;
    }
    return Number(raw);
  };
  const min = num('minBuild');
  const max = num('maxBuild');
  if (min && max && min > max) errors.push('minBuild cannot be greater than maxBuild.');
  if (min) data.minBuild = String(min);
  if (max) data.maxBuild = String(max);
  const regionsRaw = String(g.regions ?? '').trim();
  if (regionsRaw) {
    const tokens = regionsRaw.split(',').map((t) => t.trim());
    if (tokens.length > CONTRACT.limits.regionsMax || tokens.some((t) => !/^[A-Za-z]{2}$/.test(t))) {
      errors.push('regions must be comma-separated 2-letter country codes, e.g. BD,US.');
    } else {
      data.regions = tokens.map((t) => t.toUpperCase()).join(',');
    }
  }
  return { errors, data };
}

/**
 * Builds { errors, payload }. The data block is built from a fixed allow-list
 * of keys; there is no way to inject a route, URL or arbitrary key.
 *
 * form = { type, title, body, announcementId, gameId, gates, audience (result
 *          of buildAudience) }
 * ctx  = { config, projectId, token, requireToken }
 */
export function buildMessage(form, ctx = {}) {
  const errors = [];
  const title = String(form.title ?? '').trim();
  const body = String(form.body ?? '').trim();
  if (!title) errors.push('Title is required.');
  else if (title.length > CONTRACT.limits.title) errors.push(`Title is longer than ${CONTRACT.limits.title} characters.`);
  if (!body) errors.push('Message is required.');
  else if (body.length > CONTRACT.limits.body) errors.push(`Message is longer than ${CONTRACT.limits.body} characters.`);

  const data = { v: CONTRACT.version };
  if (!CONTRACT.types.includes(form.type)) {
    errors.push('Choose a notification type.');
  } else {
    data.type = form.type;
    if (form.type === 'announcement') {
      const id = String(form.announcementId ?? '');
      const known = ctx.config?.announcements?.some((a) => a.id === id);
      if (!id) errors.push('Select an announcement.');
      else if (id.length > CONTRACT.limits.id || !ID_RE.test(id) || !known) errors.push('Announcement is not in the hosted config.');
      else data.announcementId = id;
    } else if (form.type === 'game') {
      const id = String(form.gameId ?? '');
      if (!GAMES.some((g) => g.id === id)) errors.push('Select a valid game.');
      else data.gameId = id;
    }
  }

  const gates = validateGates(form.gates);
  errors.push(...gates.errors);
  Object.assign(data, gates.data);

  const audience = form.audience;
  if (!audience?.ok) errors.push(...(audience?.errors?.length ? audience.errors : ['Choose an audience.']));

  const message = {
    ...(audience?.ok ? audience.target : {}),
    notification: { title, body },
    data,
    android: { notification: { channel_id: CONTRACT.channelId } },
  };
  return { errors, payload: { message } };
}

/** Wraps a message for a dry run: FCM validates and authorises, never delivers. */
export function withValidateOnly(payload) {
  return { validate_only: true, ...payload };
}

/** Defence-in-depth check that a payload is exactly the allowed shape. */
export function assertSafePayload(payload) {
  const m = payload?.message;
  if (!m) throw new Error('Missing message');
  const allowedTop = new Set(['topic', 'condition', 'token', 'notification', 'data', 'android']);
  for (const k of Object.keys(m)) if (!allowedTop.has(k)) throw new Error(`Disallowed key: ${k}`);
  const allowedData = new Set(['v', 'type', 'announcementId', 'gameId', 'minBuild', 'maxBuild', 'regions']);
  for (const [k, v] of Object.entries(m.data ?? {})) {
    if (!allowedData.has(k)) throw new Error(`Disallowed data key: ${k}`);
    if (typeof v !== 'string') throw new Error(`Data value for ${k} must be a string`);
  }
  return true;
}

// ----------------------------------------------------------- credentials ---

/**
 * Local sanity check of the pasted credential. Returns { ok, token, error }.
 * Rejects service-account material, API keys and legacy server keys.
 */
export function validateToken(raw) {
  let t = String(raw ?? '').trim();
  if (!t) return { ok: false, error: 'Paste a short-lived OAuth access token.' };
  if (/BEGIN\s+(RSA\s+)?PRIVATE\s+KEY|private_key|"type"\s*:\s*"service_account"|client_email/i.test(t) || t.startsWith('{')) {
    return { ok: false, error: 'That looks like a service-account key. Never paste it here — use a short-lived OAuth access token instead.' };
  }
  t = t.replace(/^Bearer\s+/i, '');
  if (/^AIza[0-9A-Za-z_-]{35}$/.test(t)) {
    return { ok: false, error: 'That looks like a Firebase Web API key. FCM HTTP v1 needs an OAuth access token.' };
  }
  if (/:APA91/.test(t) || /^AAAA[\w-]{7}:/.test(t)) {
    return { ok: false, error: 'That looks like a legacy FCM server key, which is not supported. Use an OAuth access token.' };
  }
  if (/\s/.test(t)) return { ok: false, error: 'The token must not contain spaces or line breaks.' };
  if (!/^[A-Za-z0-9._~+/=-]{20,4096}$/.test(t)) return { ok: false, error: 'This does not look like an OAuth access token.' };
  return { ok: true, token: t };
}

export function validateProjectId(id) {
  const v = String(id ?? '').trim();
  return /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(v) ? { ok: true, id: v } : { ok: false, error: 'Project ID must be 6–30 chars: lowercase letters, digits, hyphens; starts with a letter.' };
}

/** Everything needed before a real send. Returns an array of error strings. */
export function preSendErrors({ projectId, token, message }) {
  const errors = [];
  const p = validateProjectId(projectId);
  if (!p.ok) errors.push(p.error);
  if (!token) errors.push('Paste an OAuth access token first.');
  else {
    const t = validateToken(token);
    if (!t.ok) errors.push(t.error);
  }
  errors.push(...message.errors);
  return errors;
}

export function fcmEndpoint(projectId) {
  const p = validateProjectId(projectId);
  if (!p.ok) throw new Error(p.error);
  return `https://fcm.googleapis.com/v1/projects/${p.id}/messages:send`;
}

/** Strips anything token-like from text before it is shown or logged. */
export function redact(text, token) {
  let s = String(text ?? '');
  if (token) s = s.split(token).join('[redacted]');
  return s.replace(/ya29\.[A-Za-z0-9._-]+/g, '[redacted]').replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]');
}

/** Maps an FCM HTTP failure to friendly text. */
export function describeHttpError(status, apiMessage = '') {
  const detail = apiMessage ? ` (${apiMessage})` : '';
  if (status === 401) return `401 — Access token invalid or expired. Generate a new one.${detail}`;
  if (status === 403) return `403 — Insufficient Firebase permission for this token/account.${detail}`;
  if (status === 404) return `404 — Project or API configuration issue. Check the project ID and that the FCM API is enabled.${detail}`;
  if (status === 400) return `400 — Invalid FCM payload or target.${detail}`;
  if (status === 429) return `429 — Rate limited. Wait and retry.${detail}`;
  if (status >= 500) return `${status} — Firebase/server error. Retry later.${detail}`;
  return `${status} — Unexpected response.${detail}`;
}

export const CORS_MESSAGE =
  'The browser was prevented from calling FCM directly (network or CORS failure). ' +
  'Check your connection, then use the generated payload with a trusted HTTP v1 sender.';

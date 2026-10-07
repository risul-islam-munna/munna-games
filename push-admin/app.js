// Dual Play Push Admin — UI wiring. All sensitive state lives in this module's
// memory; nothing here touches storage, cookies, URLs or console output.
import {
  CONTRACT, ENVIRONMENTS, GAMES, DEFAULT_PROJECT_ID, ConfigError, parseConfig, announcementStatus,
  buildAudience, buildMessage, withValidateOnly, assertSafePayload, preSendErrors, validateToken,
  fcmEndpoint, redact, describeHttpError, CORS_MESSAGE,
} from './lib.js';
import { COUNTRY_CODES, countryName, knownTimezones } from './data.js';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v);
  }
  n.append(...kids);
  return n;
};
const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };

const state = {
  env: 'production', config: null, configError: null, type: 'announcement',
  mode: 'country', countries: new Set(), builds: new Set(), timezones: [],
  touched: { title: false, body: false }, sending: false, log: [],
};

const MODES = [
  ['country', 'Country'], ['build', 'Build'], ['country_build', 'Country + Build'],
  ['timezone', 'Timezone'], ['country_timezone', 'Country + Timezone'], ['custom', 'Custom combination'],
  ['older_builds', 'Older builds (update only)'], ['device', 'Test device (FCM token)'], ['all', 'All users'],
];

// ------------------------------------------------------------- config ----
async function loadConfig() {
  const env = ENVIRONMENTS[state.env];
  state.config = null; state.configError = null;
  $('cfg-status').textContent = `Loading ${env.configUrl}…`;
  try {
    const res = await fetch(env.configUrl, { cache: 'no-store', credentials: 'omit' });
    if (!res.ok) throw new ConfigError(`HTTP ${res.status} loading ${env.configUrl}.`);
    let json;
    try { json = await res.json(); } catch { throw new ConfigError('Config is not valid JSON.'); }
    state.config = parseConfig(json, 'dualplay');
  } catch (e) {
    state.configError = e instanceof ConfigError ? e.message : `Could not load config (${e.message}).`;
  }
  state.builds = new Set();
  renderConfig();
  render();
}

function renderConfig() {
  const status = $('cfg-status'); const dl = $('cfg-summary');
  clear(dl); clear(status);
  if (state.configError) {
    status.append(el('div', { class: 'err', role: 'alert', text: `Config unavailable: ${state.configError} Build/announcement features are disabled; no build is assumed.` }));
    dl.hidden = true;
  } else if (state.config) {
    const c = state.config;
    const rows = [
      ['Current app', 'Dual Play'],
      ['Latest build', `${c.latestBuild}${c.latestVersion ? ` (v${c.latestVersion})` : ''}`],
      ['Minimum supported build', c.minSupportedBuild ?? 'not set'],
      ['Force update', c.forceUpdate ? 'Yes' : 'No'],
      ['Config updated', c.updatedAt ?? 'unknown'],
    ];
    for (const [k, v] of rows) dl.append(el('dt', { text: k }), el('dd', { text: String(v) }));
    dl.hidden = false;
  }
  // announcements
  const sel = $('ann'); clear(sel);
  const anns = state.config?.announcements ?? [];
  sel.append(el('option', { value: '', text: anns.length ? 'Select an announcement…' : 'No announcements available' }));
  for (const a of anns) {
    sel.append(el('option', { value: a.id, text: `${a.title ?? '(untitled)'} — ${a.id} — ${announcementStatus(a).status}` }));
  }
  // builds
  const bl = $('b-list'); clear(bl);
  for (const b of state.config?.builds ?? []) {
    const cb = el('input', { type: 'checkbox', value: String(b.build) });
    cb.checked = state.builds.has(b.build);
    cb.addEventListener('change', () => { cb.checked ? state.builds.add(b.build) : state.builds.delete(b.build); render(); });
    bl.append(el('label', {}, cb, document.createTextNode(b.label + (b.build === state.config.latestBuild ? ' (latest)' : ''))));
  }
}

// ---------------------------------------------------------- pickers ------
function renderCountries() {
  const q = $('c-search').value.trim().toLowerCase();
  const list = $('c-list'); clear(list);
  for (const code of COUNTRY_CODES) {
    const name = countryName(code);
    if (q && !name.toLowerCase().includes(q) && !code.toLowerCase().includes(q)) continue;
    const cb = el('input', { type: 'checkbox', value: code });
    cb.checked = state.countries.has(code);
    cb.addEventListener('change', () => { cb.checked ? state.countries.add(code) : state.countries.delete(code); render(); });
    list.append(el('label', {}, cb, document.createTextNode(`${name} (${code})`)));
  }
}

function renderTimezones() {
  const chips = $('tz-chips'); clear(chips);
  for (const z of state.timezones) {
    const b = el('button', { type: 'button', class: 'chip', 'aria-label': `Remove ${z}`, text: `${z} ✕` });
    b.addEventListener('click', () => { state.timezones = state.timezones.filter((x) => x !== z); renderTimezones(); render(); });
    chips.append(b);
  }
}

function renderModes() {
  const box = $('aud-modes'); clear(box);
  for (const [value, label] of MODES) {
    if (value === 'older_builds' && state.type !== 'update') continue;
    const r = el('input', { type: 'radio', name: 'aud', value });
    r.checked = state.mode === value;
    r.addEventListener('change', () => { state.mode = value; render(); });
    box.append(el('label', {}, r, document.createTextNode(label)));
  }
}

// ----------------------------------------------------------- compute -----
function currentAudience() {
  return buildAudience({
    mode: state.mode, countries: [...state.countries], builds: [...state.builds], timezones: state.timezones,
    deviceToken: $('dev-token').value,
  }, { latestBuild: state.config?.latestBuild, knownBuilds: state.config?.builds.map((b) => b.build) });
}

function currentMessage(audience) {
  return buildMessage({
    type: state.type, title: $('title').value, body: $('body').value, announcementId: $('ann').value, gameId: $('game').value,
    gates: { minBuild: $('g-min').value, maxBuild: $('g-max').value, regions: $('g-reg').value },
    audience,
  }, { config: state.config });
}

function maskedTarget(audience) {
  if (!audience.ok) return '—';
  const t = audience.target;
  return t.topic ?? t.condition ?? 'single device';
}

function payloadForDisplay(msg, audience) {
  // The device token is shown only in the explicit payload box, never in the log.
  return JSON.stringify(msg.payload, null, 2);
}

function render() {
  const env = ENVIRONMENTS[state.env]; const isProd = state.env === 'production';
  const banner = $('env-banner');
  banner.className = `env-banner ${isProd ? 'prod' : 'dev'}`;
  clear(banner);
  banner.append(el('span', { class: `badge ${isProd ? 'prod' : 'dev'}`, text: isProd ? '● PRODUCTION' : '◌ DEVELOPMENT' }),
    el('span', { text: isProd ? 'Sends reach real users.' : 'Dev config loaded — same Firebase project and topics.' }));

  for (const t of ['announcement', 'update', 'game']) $(`f-${t}`).hidden = state.type !== t;
  if (state.type !== 'update' && state.mode === 'older_builds') state.mode = 'country';
  renderModes();

  const m = state.mode;
  $('p-country').hidden = !['country', 'country_build', 'country_timezone', 'custom'].includes(m);
  $('p-build').hidden = !['build', 'country_build', 'custom'].includes(m);
  $('p-tz').hidden = !['timezone', 'country_timezone', 'custom'].includes(m);
  $('p-device').hidden = m !== 'device';
  $('p-older').hidden = m !== 'older_builds';
  $('aud-all-warn').hidden = m !== 'all';
  if (m === 'older_builds') {
    $('older-info').textContent = state.config
      ? `Targets 'all' minus build_${state.config.latestBuild} (current latest). Includes installs that never subscribed to a build topic. Uses a negated FCM condition — use Dry run to confirm Firebase accepts it.`
      : 'Load the config to determine the latest build.';
  }

  // announcement preview + prefill
  const ap = $('ann-preview'); clear(ap);
  const a = state.config?.announcements.find((x) => x.id === $('ann').value);
  if (a) {
    const st = announcementStatus(a);
    const dl = el('dl', { class: 'kv' });
    for (const [k, v] of [['Title', a.title], ['Body', a.body], ['ID', a.id], ['Platform', a.platform ?? 'all'],
      ['Regions', (a.regions ?? ['*']).join(', ')], ['Start', a.startAt ?? '—'], ['Expiry', a.expireAt ?? '—'],
      ['Enabled', a.enabled === false ? 'No' : 'Yes']]) dl.append(el('dt', { text: k }), el('dd', { text: String(v ?? '—') }));
    ap.append(dl);
    for (const w of st.warnings) ap.append(el('div', { class: 'warn', text: w }));
    if (!state.touched.title && a.title) $('title').value = a.title;
    if (!state.touched.body && a.body) $('body').value = a.body;
  }

  $('title-count').textContent = `${$('title').value.length}/${CONTRACT.limits.title}`;
  $('body-count').textContent = `${$('body').value.length}/${CONTRACT.limits.body}`;

  const audience = currentAudience();
  const msg = currentMessage(audience);
  $('cond').value = audience.ok ? (audience.conditionText ?? maskedTarget(audience)) : '';

  // compatibility warnings
  const compat = [];
  if (audience.ok && m !== 'all' && m !== 'device') compat.push('Country, build and timezone targeting reaches only app versions that implement these topic subscriptions and have launched at least once after updating.');
  if ((m === 'all' || m === 'older_builds') && state.type !== 'announcement') compat.push('Older app versions subscribed to "all" may not understand typed game/update intents.');
  if (m === 'older_builds') compat.push('Older installs may only be subscribed to "all" and have no build_N topic.');
  const cp = $('compat'); clear(cp); cp.hidden = compat.length === 0;
  for (const c of compat) cp.append(el('p', { text: c }));

  const ae = $('aud-errors'); clear(ae);
  if (!audience.ok && audience.errors.length) ae.append(el('div', { class: 'hint', text: audience.errors[0] }));

  $('pv-title').textContent = $('title').value || '(title)';
  $('pv-body').textContent = $('body').value || '(message)';
  const meta = $('pv-meta'); clear(meta);
  const intent = state.type === 'game' ? `Game → ${GAMES.find((g) => g.id === $('game').value)?.name ?? '—'}`
    : state.type === 'announcement' ? `Announcement → ${$('ann').value || '—'}` : 'Update';
  for (const [k, v] of [['Intent', intent], ['Audience', audience.ok ? audience.label : '—'],
    ['Target', audience.ok ? maskedTarget(audience) : '—'], ['Environment', env.label]]) meta.append(el('dt', { text: k }), el('dd', { text: v }));

  const errs = $('errors'); clear(errs);
  if (msg.errors.length) errs.append(el('div', { class: 'err', text: msg.errors.join(' ') }));
  $('payload').textContent = msg.errors.length ? '(complete the form to see the payload)' : payloadForDisplay(msg, audience);
  $('copy').disabled = msg.errors.length > 0;
  const blocked = state.sending || msg.errors.length > 0 || !!state.configError && state.type !== 'game';
  $('send').disabled = blocked; $('dry').disabled = blocked;
  $('send').textContent = state.sending ? 'Sending...' : 'Review & Send…';
}

// ------------------------------------------------------------ sending ----
function addLog(text, ok) {
  const t = new Date().toLocaleTimeString();
  state.log.unshift({ t, text, ok });
  const ul = $('log'); clear(ul);
  for (const e of state.log.slice(0, 30)) ul.append(el('li', { text: `${e.t} — ${e.ok ? '✓' : '✗'} ${e.text}` }));
}

function showResult(kind, text) {
  const r = $('result'); clear(r);
  r.append(el('div', { class: kind, text }));
}

async function post(payload, token, projectId) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(fcmEndpoint(projectId), {
      method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: ctrl.signal,
    });
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON */ }
    return { status: res.status, ok: res.ok, body };
  } finally { clearTimeout(timer); }
}

async function submit(dry) {
  if (state.sending) return;
  const audience = currentAudience();
  const msg = currentMessage(audience);
  const tv = validateToken($('token').value);
  const errs = preSendErrors({ projectId: $('project').value, token: $('token').value, message: msg });
  $('token-msg').textContent = '';
  if (errs.length) { showResult('err', errs.join(' ')); return; }
  assertSafePayload(msg.payload);

  state.sending = true; render();
  const token = tv.token;
  const summary = `${dry ? 'Dry run ' : ''}${msg.payload.message.data.type} → ${maskedTarget(audience)}`;
  try {
    const body = dry ? withValidateOnly(msg.payload) : msg.payload;
    const r = await post(body, token, $('project').value.trim());
    if (r.ok) {
      const name = r.body?.name ? ` Message ID: ${r.body.name}` : '';
      showResult('ok', dry ? 'Dry run passed: Firebase accepted the token and payload. Nothing was delivered.'
        : `Notification accepted by Firebase.${name} (Acceptance is not proof of delivery.)`);
      addLog(`Firebase ${dry ? 'validated' : 'accepted'} ${summary}`, true);
    } else {
      const text = describeHttpError(r.status, redact(r.body?.error?.message ?? '', token));
      showResult('err', text);
      addLog(`Firebase rejected ${summary} → ${r.status}`, false);
    }
  } catch (e) {
    const timeout = e?.name === 'AbortError';
    showResult('err', timeout ? 'Request timed out after 20 seconds. It may or may not have reached Firebase — do not blindly retry.' : CORS_MESSAGE);
    addLog(`${timeout ? 'Timed out' : 'Network/CORS failure'}: ${summary}`, false);
  } finally {
    state.sending = false; render();
  }
}

function openConfirm() {
  const audience = currentAudience();
  const msg = currentMessage(audience);
  const errs = preSendErrors({ projectId: $('project').value, token: $('token').value, message: msg });
  if (errs.length) { showResult('err', errs.join(' ')); return; }
  const isProd = state.env === 'production';
  const isAll = state.mode === 'all' || state.mode === 'older_builds';
  const dlg = $('confirm'); dlg.className = isProd ? 'prod' : '';
  $('cf-title').textContent = isProd ? 'You are about to send a PRODUCTION push.' : 'Send a DEVELOPMENT-config push?';
  const body = $('cf-body'); clear(body);
  const d = msg.payload.message.data;
  for (const [k, v] of [['Audience', audience.label], ['Target', maskedTarget(audience)],
    ['Type', d.type + (d.gameId ? ` → ${d.gameId}` : d.announcementId ? ` → ${d.announcementId}` : '')],
    ['Title', msg.payload.message.notification.title]]) body.append(el('p', {}, el('strong', { text: `${k}: ` }), document.createTextNode(v)));
  body.append(el('p', { class: 'warn', text: 'This action cannot be recalled after Firebase accepts it.' }));
  if (isAll) body.append(el('p', { class: 'err', text: 'This targets a very broad audience, including older app versions.' }));
  $('cf-typed').hidden = !isAll; $('cf-input').value = '';
  $('cf-ok').disabled = isAll;
  dlg.showModal();
}

// -------------------------------------------------------------- init -----
function init() {
  $('project').value = DEFAULT_PROJECT_ID;
  for (const g of GAMES) $('game').append(el('option', { value: g.id, text: `${g.name} (${g.id})` }));
  $('game').value = '';
  $('game').prepend(el('option', { value: '', text: 'Select a game…' })); $('game').value = '';
  const tzl = $('tz-options'); for (const z of knownTimezones()) tzl.append(el('option', { value: z }));
  renderCountries(); renderTimezones();

  document.querySelectorAll('input[name=env]').forEach((r) => r.addEventListener('change', () => {
    if (!r.checked) return; state.env = r.value; $('ann').value = ''; loadConfig();
  }));
  document.querySelectorAll('input[name=type]').forEach((r) => r.addEventListener('change', () => {
    if (r.checked) { state.type = r.value; render(); }
  }));
  for (const id of ['ann', 'game', 'g-min', 'g-max', 'g-reg', 'dev-token']) $(id).addEventListener('input', render);
  $('title').addEventListener('input', () => { state.touched.title = true; render(); });
  $('body').addEventListener('input', () => { state.touched.body = true; render(); });
  $('ann').addEventListener('change', () => { state.touched = { title: false, body: false }; render(); });
  $('c-search').addEventListener('input', renderCountries);
  $('tz-add').addEventListener('click', () => {
    const v = $('tz-input').value.trim();
    if (v && !state.timezones.includes(v)) state.timezones.push(v);
    $('tz-input').value = ''; renderTimezones(); render();
  });
  $('token').addEventListener('input', () => {
    const v = $('token').value; const r = v ? validateToken(v) : { ok: true };
    $('token-msg').textContent = r.ok ? '' : r.error;
  });
  $('token-show').addEventListener('click', () => {
    const t = $('token'); const show = t.type === 'password';
    t.type = show ? 'text' : 'password'; $('token-show').textContent = show ? 'Hide' : 'Show';
    $('token-show').setAttribute('aria-pressed', String(show));
  });
  const wipe = () => {
    $('token').value = ''; $('dev-token').value = ''; $('token').type = 'password';
    $('token-show').textContent = 'Show'; $('token-msg').textContent = 'Credential cleared.'; render();
  };
  $('token-clear').addEventListener('click', wipe);
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('payload').textContent); $('copy-msg').textContent = 'Copied.'; }
    catch { $('copy-msg').textContent = 'Copy failed — select the payload manually.'; }
  });
  $('dry').addEventListener('click', () => submit(true));
  $('send').addEventListener('click', openConfirm);
  $('cf-cancel').addEventListener('click', () => $('confirm').close());
  $('cf-input').addEventListener('input', () => { $('cf-ok').disabled = $('cf-input').value !== 'SEND'; });
  $('cf-ok').addEventListener('click', () => { $('confirm').close(); submit(false); });
  // Drop the credential if the page is restored from the back/forward cache.
  window.addEventListener('pageshow', (e) => { if (e.persisted) wipe(); });

  loadConfig();
}
init();

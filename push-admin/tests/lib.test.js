import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  countryTopic, buildTopic, timezoneTopic, parseConfig, ConfigError, announcementStatus, buildAudience, buildMessage,
  validateToken, validateProjectId, preSendErrors, assertSafePayload, withValidateOnly, fcmEndpoint, redact,
  describeHttpError, GAMES,
} from '../lib.js';

const CONFIG = {
  updatedAt: 'x',
  apps: { dualplay: { latestBuildNumber: 11, minSupportedBuildNumber: 1, forceUpdate: false, versions: { 9: '1.5.0', 10: '1.6.0', 11: '1.7.0' } } },
  announcements: [
    { id: 'a1', audience: ['dualplay'], platform: 'android', title: 'T', body: 'B' },
    { id: 'other', audience: ['brickscrusher'] },
  ],
};
const cfg = parseConfig(CONFIG);
const aud = (a) => buildAudience(a, { latestBuild: cfg.latestBuild, knownBuilds: cfg.builds.map((b) => b.build) });
const base = (o = {}) => ({ type: 'game', title: 'Hi', body: 'There', gameId: 'wallblock', gates: {}, audience: aud({ mode: 'country', countries: ['BD'] }), ...o });

test('topic normalisation matches Flutter', () => {
  assert.equal(countryTopic('bd'), 'country_BD');
  assert.equal(countryTopic('BDX'), null);
  assert.equal(buildTopic(9), 'build_9');
  assert.equal(buildTopic(0), null);
  assert.equal(buildTopic(-1), null);
  assert.equal(timezoneTopic('Asia/Dhaka'), 'tz_Asia.Dhaka');
  assert.equal(timezoneTopic('America/New_York'), 'tz_America.New_York');
  assert.equal(timezoneTopic('Etc/GMT+5'), 'tz_Etc.GMT~5');
  assert.equal(timezoneTopic('bad zone!'), null);
  assert.equal(timezoneTopic(''), null);
});

test('latest build and versions are read dynamically', () => {
  assert.equal(cfg.latestBuild, 11);
  assert.equal(cfg.builds[0].label, 'Build 11 — v1.7.0');
  assert.deepEqual(cfg.builds.map((b) => b.build), [11, 10, 9]);
  assert.equal(cfg.announcements.length, 1);
});
test('malformed config is rejected', () => {
  assert.throws(() => parseConfig(null), ConfigError);
  assert.throws(() => parseConfig({ apps: {} }), ConfigError);
  assert.throws(() => parseConfig({ apps: { dualplay: { latestBuildNumber: 'x' } } }), ConfigError);
  assert.throws(() => parseConfig({ apps: { dualplay: { latestBuildNumber: 0 } } }), ConfigError);
  assert.throws(() => parseConfig({ apps: { dualplay: { latestBuildNumber: 2, versions: { abc: '1' } } } }), ConfigError);
});
test('announcement status warnings', () => {
  const now = new Date('2026-10-08T00:00:00Z');
  assert.equal(announcementStatus({ id: 'a', enabled: false }, now).ok, false);
  assert.match(announcementStatus({ id: 'a', expireAt: '2026-01-01T00:00:00Z' }, now).warnings[0], /Expired/);
  assert.match(announcementStatus({ id: 'a', startAt: '2099-01-01T00:00:00Z' }, now).warnings[0], /Not started/);
  assert.equal(announcementStatus({ id: 'a', platform: 'ios' }, now).ok, false);
  assert.equal(announcementStatus({ id: 'a', platform: 'android' }, now).ok, true);
});

test('audience targets', () => {
  assert.deepEqual(aud({ mode: 'all' }).target, { topic: 'all' });
  assert.deepEqual(aud({ mode: 'country', countries: ['BD'] }).target, { topic: 'country_BD' });
  assert.deepEqual(aud({ mode: 'build', builds: [11] }).target, { topic: 'build_11' });
  assert.deepEqual(aud({ mode: 'timezone', timezones: ['Asia/Dhaka'] }).target, { topic: 'tz_Asia.Dhaka' });
  assert.equal(aud({ mode: 'country_build', countries: ['BD'], builds: [11] }).target.condition, "'country_BD' in topics && 'build_11' in topics");
  assert.equal(aud({ mode: 'country_build', countries: ['BD'], builds: [10, 11] }).target.condition,
    "'country_BD' in topics && ('build_10' in topics || 'build_11' in topics)");
  assert.equal(aud({ mode: 'country_timezone', countries: ['BD'], timezones: ['Asia/Dhaka'] }).target.condition,
    "'country_BD' in topics && 'tz_Asia.Dhaka' in topics");
  assert.equal(aud({ mode: 'older_builds' }).target.condition, "'all' in topics && !('build_11' in topics)");
});
test('audience validation', () => {
  assert.equal(aud({ mode: 'country', countries: [] }).ok, false);
  assert.equal(aud({ mode: 'country', countries: ['ZZZZ'] }).ok, false);
  assert.equal(aud({ mode: 'build', builds: [99] }).ok, false);
  assert.equal(aud({ mode: 'build', builds: [0] }).ok, false);
  assert.equal(aud({ mode: 'timezone', timezones: ['no spaces!'] }).ok, false);
  assert.equal(aud({}).ok, false);
  assert.equal(aud({ mode: 'bogus' }).ok, false);
  const many = aud({ mode: 'custom', countries: ['BD', 'US', 'IN'], builds: [9, 10, 11] });
  assert.equal(many.ok, false);
  assert.match(many.errors[0], /at most 5/);
  assert.equal(aud({ mode: 'device', deviceToken: 'short' }).ok, false);
  assert.equal(aud({ mode: 'older_builds' }).ok, true);
  assert.equal(buildAudience({ mode: 'older_builds' }, {}).ok, false);
});
test('global audience requires explicit selection', () => {
  assert.equal(aud({ mode: 'country' }).ok, false);
  assert.equal(aud({ mode: 'country' }).target, null);
  assert.equal(aud({}).target, null);
});

test('game payload', () => {
  const { errors, payload } = buildMessage(base(), { config: cfg });
  assert.deepEqual(errors, []);
  assert.deepEqual(payload, { message: {
    topic: 'country_BD',
    notification: { title: 'Hi', body: 'There' },
    data: { v: '1', type: 'game', gameId: 'wallblock' },
    android: { notification: { channel_id: 'dual_play_push' } },
  } });
  assert.ok(assertSafePayload(payload));
});
test('update payload carries no url', () => {
  const { payload, errors } = buildMessage(base({ type: 'update', gameId: '' }), { config: cfg });
  assert.deepEqual(errors, []);
  assert.deepEqual(payload.message.data, { v: '1', type: 'update' });
});
test('announcement payload', () => {
  const { payload, errors } = buildMessage(base({ type: 'announcement', announcementId: 'a1' }), { config: cfg });
  assert.deepEqual(errors, []);
  assert.deepEqual(payload.message.data, { v: '1', type: 'announcement', announcementId: 'a1' });
});
test('condition target uses condition key', () => {
  const a = aud({ mode: 'country_build', countries: ['BD'], builds: [11] });
  const { payload } = buildMessage(base({ audience: a }), { config: cfg });
  assert.equal(payload.message.condition, "'country_BD' in topics && 'build_11' in topics");
  assert.equal(payload.message.topic, undefined);
});
test('gates are strings and validated', () => {
  const { payload, errors } = buildMessage(base({ gates: { minBuild: '9', maxBuild: '10', regions: 'bd, us' } }), { config: cfg });
  assert.deepEqual(errors, []);
  assert.deepEqual(payload.message.data, { v: '1', type: 'game', gameId: 'wallblock', minBuild: '9', maxBuild: '10', regions: 'BD,US' });
  assert.ok(buildMessage(base({ gates: { minBuild: '0' } }), { config: cfg }).errors.length);
  assert.ok(buildMessage(base({ gates: { minBuild: '10', maxBuild: '9' } }), { config: cfg }).errors.length);
  assert.ok(buildMessage(base({ gates: { regions: 'BDX' } }), { config: cfg }).errors.length);
});

test('form validation', () => {
  const e = (o) => buildMessage(base(o), { config: cfg }).errors.join('|');
  assert.match(e({ title: '  ' }), /Title is required/);
  assert.match(e({ body: '' }), /Message is required/);
  assert.match(e({ title: 'x'.repeat(121) }), /Title is longer/);
  assert.match(e({ body: 'x'.repeat(301) }), /Message is longer/);
  assert.match(e({ gameId: 'nope' }), /valid game/);
  assert.match(e({ type: 'announcement', announcementId: 'ghost' }), /not in the hosted config/);
  assert.match(e({ type: 'announcement', announcementId: 'other' }), /not in the hosted config/);
  assert.match(e({ type: 'announcement', announcementId: '' }), /Select an announcement/);
  assert.match(e({ type: 'bogus' }), /Choose a notification type/);
  assert.match(e({ audience: aud({ mode: 'country' }) }), /Select at least one country/);
});
test('credential and project checks', () => {
  assert.equal(validateProjectId('dual-play-2026').ok, true);
  assert.equal(validateProjectId('Bad_ID').ok, false);
  assert.equal(validateProjectId('').ok, false);
  const msg = buildMessage(base(), { config: cfg });
  assert.ok(preSendErrors({ projectId: 'dual-play-2026', token: '', message: msg }).some((x) => /token/i.test(x)));
  assert.ok(preSendErrors({ projectId: 'X!', token: 'ya29.' + 'a'.repeat(40), message: msg }).length);
  assert.deepEqual(preSendErrors({ projectId: 'dual-play-2026', token: 'ya29.' + 'a'.repeat(40), message: msg }), []);
});

test('cannot smuggle route / url / arbitrary keys', () => {
  const { payload } = buildMessage({ ...base(), route: '/play', url: 'https://evil', updateUrl: 'https://evil', data: { url: 'x' } }, { config: cfg });
  assert.deepEqual(Object.keys(payload.message.data).sort(), ['gameId', 'type', 'v']);
  assert.throws(() => assertSafePayload({ message: { topic: 't', data: { url: 'https://x' } } }), /Disallowed/);
  assert.throws(() => assertSafePayload({ message: { topic: 't', data: { v: 1 } } }), /string/);
  assert.throws(() => assertSafePayload({ message: { topic: 't', webhook: {} } }), /Disallowed/);
});
test('service-account material and other keys are rejected as tokens', () => {
  assert.equal(validateToken('-----BEGIN PRIVATE KEY-----\nabc').ok, false);
  assert.equal(validateToken('{"type":"service_account","private_key":"x"}').ok, false);
  assert.equal(validateToken('AIza' + 'a'.repeat(35)).ok, false);
  assert.equal(validateToken('AAAAabcdefg:APA91bxxxxxxxxxxxxxxxxxxxx').ok, false);
  assert.equal(validateToken('has space in it xxxxxxxxxxxxxxxxx').ok, false);
  assert.equal(validateToken('').ok, false);
  assert.equal(validateToken('short').ok, false);
  const ok = validateToken('Bearer ya29.a0AfH6' + 'x'.repeat(30));
  assert.equal(ok.ok, true);
  assert.ok(!ok.token.startsWith('Bearer'));
});
test('dry run wrapper and endpoint', () => {
  assert.equal(withValidateOnly({ message: {} }).validate_only, true);
  assert.equal(fcmEndpoint('dual-play-2026'), 'https://fcm.googleapis.com/v1/projects/dual-play-2026/messages:send');
  assert.throws(() => fcmEndpoint('../x'));
});
test('redaction and error text', () => {
  assert.ok(!redact('bad ya29.SECRETSECRET token', null).includes('SECRET'));
  assert.ok(!redact('Bearer abcdef.ghi', null).includes('abcdef'));
  assert.ok(!redact('tok123456789', 'tok123456789').includes('tok123'));
  assert.match(describeHttpError(401), /invalid or expired/);
  assert.match(describeHttpError(403), /permission/);
  assert.match(describeHttpError(429), /Rate limited/);
  assert.match(describeHttpError(503), /server error/);
});
test('game list matches Flutter registry ids', () => {
  assert.deepEqual(GAMES.map((g) => g.id).sort(), ['baghbandi', 'dotsandboxes', 'four_in_a_row', 'ludo', 'memory_match', 'shape_crack', 'sholo_guti', 'tictactoe', 'wallblock']);
});

test('source never persists or logs the token', () => {
  for (const f of ['../app.js', '../lib.js', '../data.js', '../index.html']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB|document\.cookie|console\.|location\.(hash|search)|history\.(push|replace)State/, f);
  }
});
test('no secrets in push-admin files', () => {
  const dir = new URL('../', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => /\.(js|html|css|json)$/.test(n))) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    assert.doesNotMatch(src, /BEGIN (RSA )?PRIVATE KEY|ya29\.[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}/, f);
  }
});

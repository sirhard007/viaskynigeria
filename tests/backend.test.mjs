import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { localStore, SupabaseStore } from '../server/store.mjs';
import { createHandler } from '../server/handler.mjs';
import { cleanEvent, summarize, dateRange } from '../server/model.mjs';
import { hashPassword, verifyPassword, makeSession, validSession } from '../server/security.mjs';

const password = 'test-only-' + randomBytes(16).toString('hex');
const secret = randomBytes(48).toString('hex');
const passwordHash = hashPassword(password);
const event = (name = 'page_view', extra = {}) => ({ id: randomUUID(), visitor: randomUUID(), session: randomUUID(), name, page: '/', source: 'instagram', data: {}, ...extra });

function request(handler, action, options = {}) {
  const req = Readable.from(options.body === undefined ? [] : [JSON.stringify(options.body)]);
  req.url = '/api/analytics?action=' + action;
  req.method = options.method || (options.body === undefined ? 'GET' : 'POST');
  req.headers = { origin: 'http://localhost:8766', 'user-agent': 'ViaSky-integration-test', ...(options.headers || {}) };
  req.socket = { remoteAddress: '127.0.0.1' };
  const headers = {};
  return new Promise((resolve, reject) => {
    const res = { statusCode: 200, setHeader(key, value) { headers[key.toLowerCase()] = value; }, end(text) { resolve({ status: this.statusCode, headers, body: text ? JSON.parse(text) : null }); } };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}
async function fixture() {
  const store = await localStore(':memory:');
  const handler = createHandler({ store, local: true, settings: () => ({ passwordHash, secret }), allowedOrigins: ['http://localhost:8766'] });
  return { store, handler };
}
test('server strips arbitrary and personal event fields even for malicious clients', () => {
  const input = event('service_select', { email: 'secret@example.com', page: '/?email=secret', data: { service: 'visa', destination: 'DOH', step: 3, name: 'Secret', notes: 'Private', phone: '08000000000', link_url: 'https://wa.me/?text=secret' } });
  const safe = cleanEvent(input, { country: 'NG', device: 'mobile' });
  assert.deepEqual(safe.data, { service: 'visa', destination: 'DOH', step: 3 });
  assert.equal(safe.page, '/'); assert.doesNotMatch(JSON.stringify(safe), /secret|Private|08000000000|link_url/);
  assert.equal(cleanEvent(event('bad-event')), null);
});
test('password hashes, signed session integrity and expiration', () => {
  assert.ok(verifyPassword(password, passwordHash)); assert.ok(!verifyPassword('wrong', passwordHash));
  const now = Date.now(), token = makeSession(secret, now);
  assert.ok(validSession(token, secret, now)); assert.ok(!validSession(token + 'tamper', secret, now));
  assert.ok(!validSession(token, secret, now + 8 * 3600000)); assert.ok(!validSession(token, 'other-secret', now));
});
test('reports require authentication and accept only same-origin logins', async () => {
  const { handler, store } = await fixture();
  try {
    assert.equal((await request(handler, 'summary')).status, 401);
    assert.equal((await request(handler, 'login', { body: { password }, headers: { origin: 'https://evil.test' } })).status, 403);
    assert.equal((await request(handler, 'login', { body: { password: 'wrong' } })).status, 401);
    const login = await request(handler, 'login', { body: { password } });
    assert.equal(login.status, 200); assert.match(login.headers['set-cookie'], /HttpOnly; SameSite=Strict/);
    const cookie = login.headers['set-cookie'].split(';')[0];
    const report = await request(handler, 'summary&days=7', { headers: { cookie } });
    assert.equal(report.status, 200); assert.equal(report.body.totals.visits, 0); assert.equal(report.body.daily.length, 7);
    const logout = await request(handler, 'logout', { body: {}, headers: { cookie } }); assert.match(logout.headers['set-cookie'], /Max-Age=0/);
  } finally { store.db.close(); }
});
test('collection deduplicates retries and private form contents never reach stored rows', async () => {
  const { handler, store } = await fixture();
  try {
    const item = event('whatsapp_handoff', { data: { service: 'umrah', destination: 'JED', email: 'secret@example.com' } });
    assert.equal((await request(handler, 'collect', { body: { events: [item] } })).status, 200);
    assert.equal((await request(handler, 'collect', { body: { events: [item] } })).status, 200);
    const rows = store.db.prepare('select payload from events').all(); assert.equal(rows.length, 1); assert.doesNotMatch(rows[0].payload, /secret@example/);
    const report = await store.summary(dateRange(7)); assert.equal(report.totals.handoffs, 1); assert.equal(report.totals.visitors, 1);
    assert.equal((await request(handler, 'collect', { body: { events: Array(21).fill(item) } })).status, 400);
  } finally { store.db.close(); }
});
test('login rate limit persists in the database and public setup is disabled', async () => {
  const { handler, store } = await fixture();
  try {
    for (let i = 0; i < 5; i++) assert.equal((await request(handler, 'login', { body: { password: 'wrong' } })).status, 401);
    assert.equal((await request(handler, 'login', { body: { password } })).status, 429);
    const production = createHandler({ store, settings: () => ({ passwordHash: '', secret }), allowedOrigins: ['http://localhost:8766'] });
    assert.equal((await request(production, 'setup', { body: { password } })).status, 403);
    assert.equal((await request(production, 'collect', { body: { events: [event()] } })).status, 503);
  } finally { store.db.close(); }
});
test('Lagos date boundaries, distinct visitors, enquiry rate and independent journey counts', () => {
  const range = dateRange(7, new Date('2026-11-06T23:30:00Z'));
  assert.equal(range.end, '2026-11-07T23:00:00.000Z');
  const visitor = randomUUID(), session = randomUUID();
  const rows = ['page_view', 'planner_open', 'whatsapp_handoff', 'whatsapp_click'].map(name => cleanEvent(event(name, { visitor, session }), {}, new Date('2026-11-06T23:30:00Z')));
  const report = summarize(rows, range, new Date('2026-11-06T23:30:00Z'));
  assert.equal(report.totals.visits, 1); assert.equal(report.totals.handoffs, 2); assert.equal(report.totals.conversion, 100);
  assert.equal(report.daily.at(-1).date, '2026-11-07'); assert.equal(report.daily.at(-1).visits, 1);
});
test('Supabase secret keys are server-only and empty insert responses are handled', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(options.headers.apikey, 'sb_secret_test'); assert.equal(options.headers.Authorization, undefined);
      assert.ok(url.startsWith('https://test.supabase.co/rest/v1/')); return { ok: true, status: 201, text: async () => '' };
    };
    const store = new SupabaseStore('https://test.supabase.co', 'sb_secret_test'); await store.insert([cleanEvent(event())]);
  } finally { globalThis.fetch = originalFetch; }
});

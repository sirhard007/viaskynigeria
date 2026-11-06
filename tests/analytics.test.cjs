const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const code = fs.readFileSync(path.join(__dirname, '..', 'analytics.js'), 'utf8');
function fixture(options = {}) {
  const calls = [], actions = {}, timers = new Map(), storage = new Map(), session = new Map();
  let nextTimer = 0;
  const control = key => ({ addEventListener: (_, fn) => { actions[key] = fn; }, focus() {} });
  const controls = { '[data-analytics-accept]': control('accept'), '[data-analytics-decline]': control('decline') };
  const banner = { hidden: true, querySelector: key => controls[key] };
  const browserStorage = map => ({ getItem(key) { if (options.blockStorage) throw new Error('blocked'); return map.get(key) || null; }, setItem(key, value) { if (options.blockStorage) throw new Error('blocked'); map.set(key, value); }, removeItem(key) { map.delete(key); } });
  const localStorage = browserStorage(storage), sessionStorage = browserStorage(session);
  const window = { VIASKY_ANALYTICS_CONFIG: { productionHosts: ['viaskynigeria.com'], localHosts: ['localhost'], endpoint: '/api/analytics?action=collect' }, addEventListener(name, fn) { actions[name] = fn; } };
  window.localStorage = localStorage;
  window.sessionStorage = sessionStorage;
  const document = { readyState: 'complete', referrer: 'https://instagram.com/private?email=secret@example.com', visibilityState: 'visible', getElementById: () => banner, querySelectorAll: () => [], addEventListener(name, fn) { actions[name] = fn; } };
  vm.runInNewContext(code, { window, document, localStorage, sessionStorage, URL, URLSearchParams, crypto: webcrypto, console,
    location: { hostname: options.hostname || 'viaskynigeria.com', pathname: '/', search: '?email=secret@example.com&utm_source=instagram' },
    setTimeout(fn) { const id = ++nextTimer; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); },
    fetch: async (url, options) => { calls.push({ url, options }); return { status: 200 }; }
  });
  return { calls, actions, storage, session, banner, window, async flush() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve)); } };
}
test('no analytics requests or browser identifiers before consent or after decline', async () => {
  const f = fixture(); f.window.viaSkyAnalytics.track('planner_open'); await f.flush();
  assert.equal(f.calls.length, 0); assert.equal(f.storage.size, 0); assert.equal(f.session.size, 0);
  f.actions.decline(); f.window.viaSkyAnalytics.track('whatsapp_click'); await f.flush(); assert.equal(f.calls.length, 0);
});
test('accepted analytics uses only the first-party endpoint and strips private fields', async () => {
  const f = fixture(); f.actions.accept();
  f.window.viaSkyAnalytics.track('planner_step_view', { step: 4, service: 'visa', destination: 'DOH', name: 'Private Name', notes: 'secret', email: 'secret@example.com', link_url: 'https://wa.me/?text=secret' });
  f.window.viaSkyAnalytics.track('unknown'); await f.flush();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, '/api/analytics?action=collect');
  const events = JSON.parse(f.calls[0].options.body).events;
  assert.deepEqual(events.map(event => event.name), ['page_view', 'planner_step_view']);
  assert.equal(events[1].source, 'instagram'); assert.equal(events[1].data.destination, 'DOH');
  assert.doesNotMatch(f.calls[0].options.body, /secret|Private Name|wa\.me|email|notes/);
  assert.equal(events[0].visitor, events[1].visitor); assert.equal(events[0].session, events[1].session);
});
test('withdrawal drops pending events and removes tracking identifiers', async () => {
  const f = fixture(); f.actions.accept(); f.window.viaSkyAnalytics.track('planner_open'); f.actions.decline(); await f.flush();
  assert.equal(f.calls.length, 0);
  assert.ok(!f.storage.has('viasky.analytics-visitor.v1')); assert.equal(f.session.size, 0);
});
test('preview deployments are excluded; localhost data goes only to its own backend', async () => {
  const preview = fixture({ hostname: 'preview.vercel.app' }); preview.actions.accept(); await preview.flush(); assert.equal(preview.calls.length, 0);
  const local = fixture({ hostname: 'localhost' }); local.actions.accept(); await local.flush(); assert.equal(local.calls[0].url, '/api/analytics?action=collect');
});
test('blocked browser storage still permits an in-memory consented session', async () => {
  const f = fixture({ blockStorage: true }); f.actions.accept(); await f.flush(); assert.equal(f.calls.length, 1); f.actions.decline();
});

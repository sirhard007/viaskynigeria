'use strict';
(() => {
  const config = window.VIASKY_ANALYTICS_CONFIG || {};
  const enabled = [...(config.productionHosts || []), ...(config.localHosts || [])].includes(location.hostname);
  const endpoint = config.endpoint || '/api/analytics?action=collect';
  const storageKey = 'viasky.analytics-consent.v2';
  const visitorKey = 'viasky.analytics-visitor.v1';
  const sessionKey = 'viasky.analytics-session.v1';
  const lifetime = 180 * 86400000;
  const persistentStorage = browserStorage('localStorage');
  const tabStorage = browserStorage('sessionStorage');
  const services = ['visa', 'flight', 'hotel', 'holiday', 'umrah'];
  const destinations = ['LHR', 'JED', 'IST', 'KUL', 'SIN', 'BKK', 'DPS', 'DOH', 'DXB', 'CPT', 'ZNZ', 'RAK', 'ANY'];
  const events = ['page_view', 'planner_open', 'service_select', 'destination_select', 'planner_step_view', 'planner_step_complete', 'whatsapp_handoff', 'whatsapp_click'];
  const placements = ['hero', 'services', 'destinations', 'about', 'footer', 'faq', 'cta', 'navigation', 'other'];
  let consent = read(persistentStorage, storageKey)?.choice || null;
  let visitor, session, banner, timer;
  let queue = [];
  let pageTracked = false;
  let busy = false;
  let generation = 0;
  function browserStorage(name) {
    try { return window[name]; } catch (_) { return null; }
  }
  function read(storage, key) {
    try { const item = JSON.parse(storage.getItem(key)); return item && item.expires > Date.now() ? item : null; } catch (_) { return null; }
  }
  function write(storage, key, item) { try { storage.setItem(key, JSON.stringify(item)); } catch (_) { /* Memory fallback. */ } }
  function remove(storage, key) { try { storage.removeItem(key); } catch (_) { /* Storage may be disabled. */ } }
  function uuid() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (Number(c) ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> Number(c) / 4).toString(16));
  }
  function source() {
    const query = new URLSearchParams(location.search).get('utm_source')?.toLowerCase();
    const known = ['instagram', 'facebook', 'google', 'bing', 'whatsapp', 'tiktok', 'linkedin', 'newsletter'];
    if (known.includes(query)) return query;
    try {
      const host = new URL(document.referrer).hostname.toLowerCase();
      if (host === location.hostname) return 'direct';
      return known.find(name => host === name + '.com' || host.endsWith('.' + name + '.com')) || 'other';
    } catch (_) { return 'direct'; }
  }
  function identity() {
    visitor = visitor || read(persistentStorage, visitorKey) || { id: uuid(), expires: Date.now() + lifetime };
    if (visitor.expires <= Date.now()) visitor = { id: uuid(), expires: Date.now() + lifetime };
    session = session && session.expires > Date.now() ? session : read(tabStorage, sessionKey) || { id: uuid(), source: source(), expires: Date.now() + 30 * 60000 };
    session.expires = Date.now() + 30 * 60000;
    write(persistentStorage, visitorKey, visitor);
    write(tabStorage, sessionKey, session);
  }
  function track(name, input = {}) {
    if (consent !== 'accepted' || !enabled || !events.includes(name)) return;
    identity();
    const data = {};
    if (services.includes(input.service)) data.service = input.service;
    if (destinations.includes(input.destination)) data.destination = input.destination;
    if ([1, 2, 3, 4].includes(input.step)) data.step = input.step;
    if (placements.includes(input.placement)) data.placement = input.placement;
    const event = { id: uuid(), visitor: visitor.id, session: session.id, name, page: location.pathname === '/privacy.html' ? '/privacy.html' : '/', source: session.source, data };
    if (config.debug) console.info('[ViaSky analytics]', name, data);
    if (queue.length < 80) queue.push(event);
    if (name === 'whatsapp_handoff' || name === 'whatsapp_click') void flush(true);
    else if (!timer) timer = setTimeout(() => { timer = null; void flush(); }, 1500);
  }
  async function flush(unloading = false) {
    if (busy || consent !== 'accepted' || !queue.length) return;
    const batch = queue.splice(0, 20);
    const revision = generation;
    busy = true;
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify({ events: batch }), keepalive: true });
      if ((response.status >= 500 || response.status === 429) && consent === 'accepted' && revision === generation) queue = [...batch, ...queue].slice(0, 80);
    } catch (_) { if (consent === 'accepted' && revision === generation) queue = [...batch, ...queue].slice(0, 80); }
    finally {
      busy = false;
      if (!unloading && queue.length && consent === 'accepted' && !timer) timer = setTimeout(() => { timer = null; void flush(); }, 15000);
    }
  }
  function start() { if (consent === 'accepted' && !pageTracked) { pageTracked = true; track('page_view'); } }
  function choose(choice) {
    consent = choice; generation++;
    write(persistentStorage, storageKey, { choice, expires: Date.now() + lifetime });
    if (banner) banner.hidden = true;
    if (choice === 'accepted') start();
    else {
      clearTimeout(timer); timer = null; queue = []; visitor = null; session = null; pageTracked = false;
      remove(persistentStorage, visitorKey); remove(tabStorage, sessionKey);
    }
  }
  function placement(element) {
    if (element.closest('.hero')) return 'hero';
    if (element.closest('#services')) return 'services';
    if (element.closest('#destinations')) return 'destinations';
    if (element.closest('#about')) return 'about';
    if (element.closest('.site-footer')) return 'footer';
    if (element.closest('#faq')) return 'faq';
    if (element.closest('#start-your-journey')) return 'cta';
    if (element.closest('.site-header, .mobile-menu')) return 'navigation';
    return 'other';
  }
  window.viaSkyAnalytics = Object.freeze({ track, placement });
  function init() {
    banner = document.getElementById('analytics-consent');
    if (banner) {
      banner.hidden = consent !== null;
      banner.querySelector('[data-analytics-accept]').addEventListener('click', () => choose('accepted'));
      banner.querySelector('[data-analytics-decline]').addEventListener('click', () => choose('declined'));
    }
    document.querySelectorAll('[data-analytics-settings]').forEach(button => button.addEventListener('click', () => {
      if (banner) { banner.hidden = false; banner.querySelector('[data-analytics-decline]').focus(); }
    }));
    document.addEventListener('click', event => {
      const link = event.target.closest('a[href]');
      if (!link) return;
      try { if (['wa.me', 'api.whatsapp.com'].includes(new URL(link.href).hostname)) track('whatsapp_click', { placement: placement(link) }); } catch (_) { /* Ignore invalid links. */ }
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flush(true); });
    window.addEventListener('pagehide', () => { void flush(true); });
    start();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

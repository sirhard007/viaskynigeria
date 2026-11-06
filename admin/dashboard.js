'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const numbers = new Intl.NumberFormat('en-NG');
  const labels = { visa: 'Visa assistance', flight: 'Flights', hotel: 'Hotels & stays', holiday: 'Holiday packages', umrah: 'Umrah', LHR: 'United Kingdom · London', JED: 'Saudi Arabia · Umrah', IST: 'Turkey · Istanbul', KUL: 'Malaysia · Kuala Lumpur', SIN: 'Singapore', BKK: 'Thailand', DPS: 'Indonesia · Bali', DOH: 'Qatar · Doha', DXB: 'UAE · Dubai', CPT: 'South Africa', ZNZ: 'Tanzania · Zanzibar', RAK: 'Morocco · Marrakech', ANY: 'Somewhere else', direct: 'Direct / internal', other: 'Other', instagram: 'Instagram', facebook: 'Facebook', google: 'Google', bing: 'Bing', whatsapp: 'WhatsApp', tiktok: 'TikTok', linkedin: 'LinkedIn', newsletter: 'Newsletter', desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet', hero: 'Homepage hero', services: 'Services', destinations: 'Destinations', about: 'About ViaSky', footer: 'Footer', faq: 'FAQs', cta: 'Final invitation', navigation: 'Navigation', planner: 'Trip planner' };
  const countryNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;
  let setup = false;
  let loggedIn = false;
  let requestNumber = 0;
  let refreshing = false;

  async function api(action, data) {
    const response = await fetch('/api/analytics?action=' + action, data === undefined ? { credentials: 'same-origin', cache: 'no-store' } : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) { const error = new Error(result.error || 'Please try again.'); error.status = response.status; throw error; }
    return result;
  }
  const count = value => Math.max(0, Number(value) || 0);
  function node(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
  function meter(amount, maximum) {
    const track = node('div', 'meter');
    const fill = node('div', 'meter-fill');
    fill.style.width = Math.min(100, maximum ? amount / maximum * 100 : 0) + '%';
    track.append(fill); return track;
  }
  function displayLabel(label, country = false) {
    if (country && /^[A-Z]{2}$/.test(label)) { try { return countryNames?.of(label) || label; } catch (_) { return label; } }
    return labels[label] || label;
  }
  function ranked(id, items, country = false) {
    const target = $(id); target.replaceChildren();
    if (!items?.length) { target.append(node('div', 'rank-empty', 'No activity recorded yet')); return; }
    const maximum = Math.max(...items.map(item => count(item.count)), 1);
    items.forEach(item => {
      const row = node('div', 'rank-row');
      const left = node('div');
      left.append(node('div', 'rank-label', displayLabel(String(item.label), country)), meter(count(item.count), maximum));
      row.append(left, node('span', 'rank-count', numbers.format(count(item.count)))); target.append(row);
    });
  }
  function journey(items) {
    const target = $('journey'); target.replaceChildren();
    const max = Math.max(...items.map(item => count(item.count)), 1);
    items.forEach((item, i) => {
      const row = node('div', 'journey-row');
      const middle = node('div'); middle.append(node('div', 'journey-label', item.label), meter(count(item.count), max));
      row.append(node('span', 'journey-number', String(i + 1).padStart(2, '0')), middle, node('span', 'journey-value', numbers.format(count(item.count)))); target.append(row);
    });
  }
  function chart(days) {
    const target = $('traffic-chart'); target.replaceChildren();
    const ns = 'http://www.w3.org/2000/svg';
    const svg = (tag, attrs) => { const el = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value))); return el; };
    const image = svg('svg', { viewBox: '0 0 660 210', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    const max = Math.max(...days.map(day => Math.max(count(day.visits), count(day.handoffs))), 4);
    for (let i = 0; i <= 4; i++) {
      const y = 15 + i * 42;
      image.append(svg('line', { x1: 28, x2: 650, y1: y, y2: y, stroke: '#e9eef3', 'stroke-dasharray': '3 4' }));
      const text = svg('text', { x: 0, y: y + 3, fill: '#8a98a8', 'font-size': 9 }); text.textContent = String(Math.round(max * (1 - i / 4))); image.append(text);
    }
    const coords = key => days.map((day, i) => [28 + i / Math.max(days.length - 1, 1) * 622, 183 - count(day[key]) / max * 168]);
    const visits = coords('visits');
    image.append(svg('polygon', { points: '28,183 ' + visits.map(p => p.join(',')).join(' ') + ' 650,183', fill: '#062b600b' }));
    for (const [key, color] of [['visits', '#062b60'], ['handoffs', '#e7aa25']]) image.append(svg('polyline', { points: coords(key).map(p => p.join(',')).join(' '), fill: 'none', stroke: color, 'stroke-width': 2.3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    const indexes = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])];
    indexes.forEach(i => {
      if (!days[i]) return;
      const label = svg('text', { x: 28 + i / Math.max(days.length - 1, 1) * 622, y: 207, fill: '#8795a5', 'font-size': 9, 'text-anchor': i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle' });
      label.textContent = new Date(days[i].date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); image.append(label);
    });
    target.append(image);
    target.setAttribute('aria-label', `${days.length} days of traffic. ${days.reduce((n, day) => n + count(day.visits), 0)} daily visits in total.`);
    const table = $('daily-rows'); table.replaceChildren();
    days.forEach(day => { const row = node('tr'); row.append(node('td', '', day.date), node('td', '', numbers.format(count(day.visits))), node('td', '', numbers.format(count(day.handoffs)))); table.append(row); });
  }
  function showReport(data) {
    for (const field of ['visitors', 'visits', 'handoffs']) $('metric-' + field).textContent = numbers.format(count(data.totals[field]));
    $('metric-conversion').textContent = count(data.totals.conversion).toFixed(1) + '%';
    $('active-count').textContent = numbers.format(count(data.totals.active));
    $('empty-state').hidden = count(data.totals.visits) > 0;
    chart(data.daily || []); journey(data.journey || []);
    ['services', 'destinations', 'sources', 'devices', 'placements'].forEach(key => ranked(key, data[key]));
    ranked('countries', data.countries, true);
    $('updated').textContent = 'Updated ' + new Date(data.generatedAt).toLocaleTimeString('en-GB', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit' });
  }
  async function load() {
    const request = ++requestNumber;
    $('refresh').disabled = true;
    try {
      const result = await api('summary&days=' + $('range').value);
      if (request !== requestNumber) return;
      showReport(result); $('report-message').textContent = '';
    } catch (error) {
      if (request !== requestNumber) return;
      if (error.status === 401) { loggedIn = false; $('dashboard').hidden = true; $('logout').hidden = true; $('auth-panel').hidden = false; $('auth-form').hidden = false; $('auth-message').textContent = 'Your session has ended. Please sign in again.'; }
      else $('report-message').textContent = error.message;
    } finally { if (request === requestNumber) $('refresh').disabled = false; }
  }
  async function signedIn() {
    loggedIn = true; $('auth-panel').hidden = true; $('dashboard').hidden = false; $('logout').hidden = false;
    $('password').value = ''; $('confirm-password').value = '';
    await load();
  }
  $('auth-form').addEventListener('submit', async event => {
    event.preventDefault();
    const password = $('password').value;
    if (setup && (password.length < 12 || password !== $('confirm-password').value)) { $('auth-message').textContent = 'Use at least 12 characters and enter the same password twice.'; return; }
    $('signin').disabled = true; $('auth-message').textContent = '';
    try { await api(setup ? 'setup' : 'login', { password }); setup = false; await signedIn(); }
    catch (error) { $('auth-message').textContent = error.message; }
    finally { $('signin').disabled = false; }
  });
  $('show-password').addEventListener('click', () => {
    const show = $('password').type === 'password'; $('password').type = show ? 'text' : 'password';
    $('show-password').textContent = show ? 'Hide' : 'Show'; $('show-password').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  $('range').addEventListener('change', load); $('refresh').addEventListener('click', load);
  $('logout').addEventListener('click', async () => {
    try { await api('logout', {}); location.reload(); } catch (error) { $('report-message').textContent = error.message; }
  });
  setInterval(() => { if (loggedIn && document.visibilityState === 'visible' && !$('refresh').disabled) void load(); }, 30000);
  (async () => {
    try {
      const state = await api('status');
      $('storage-badge').hidden = state.storage !== 'local';
      if (state.authenticated) return signedIn();
      if (state.setupAvailable) {
        setup = true; $('auth-title').textContent = 'Make this space yours.';
        $('auth-description').textContent = 'Create a password for your local analytics dashboard. This is a separate test database, so you can explore without affecting live traffic.';
        $('confirm-wrap').hidden = false; $('confirm-password').required = true;
        $('password').autocomplete = 'new-password'; $('password').minLength = 12;
        $('password-label').textContent = 'Choose a password · 12 characters minimum';
        $('signin').textContent = 'Create local dashboard ↗';
      } else if (!state.configured) {
        $('auth-message').textContent = 'Your production database and dashboard credentials need to be connected in Vercel. The reports will become available after setup.'; return;
      }
      $('auth-form').hidden = false; $('auth-message').textContent = '';
    } catch (_) { $('auth-message').textContent = 'Cannot reach the analytics server. Open this dashboard using the ViaSky development server or the connected Vercel deployment.'; }
  })();
})();

export const EVENT_NAMES = new Set(['page_view', 'planner_open', 'service_select', 'destination_select', 'planner_step_view', 'planner_step_complete', 'whatsapp_handoff', 'whatsapp_click']);
const SERVICES = new Set(['visa', 'flight', 'hotel', 'holiday', 'umrah']);
const DESTINATIONS = new Set(['LHR', 'JED', 'IST', 'KUL', 'SIN', 'BKK', 'DPS', 'DOH', 'DXB', 'CPT', 'ZNZ', 'RAK', 'ANY']);
const PLACEMENTS = new Set(['hero', 'services', 'destinations', 'about', 'footer', 'faq', 'cta', 'navigation', 'other']);
const SOURCES = new Set(['direct', 'instagram', 'facebook', 'google', 'bing', 'whatsapp', 'tiktok', 'linkedin', 'newsletter', 'other']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function cleanEvent(input, meta = {}, now = new Date()) {
  if (!input || !EVENT_NAMES.has(input.name) || !UUID.test(input.id || '') || !UUID.test(input.visitor || '') || !UUID.test(input.session || '')) return null;
  const data = input.data || {};
  const safe = {};
  if (SERVICES.has(data.service)) safe.service = data.service;
  if (DESTINATIONS.has(data.destination)) safe.destination = data.destination;
  if ([1, 2, 3, 4].includes(data.step)) safe.step = data.step;
  if (PLACEMENTS.has(data.placement)) safe.placement = data.placement;
  return {
    id: input.id.toLowerCase(), visitor_id: input.visitor.toLowerCase(), session_id: input.session.toLowerCase(),
    name: input.name, occurred_at: now.toISOString(),
    page: input.page === '/privacy.html' ? '/privacy.html' : '/',
    source: SOURCES.has(input.source) ? input.source : 'other',
    device: meta.device || 'desktop', country: /^[A-Z]{2}$/.test(meta.country || '') ? meta.country : 'Unknown',
    data: safe
  };
}

export function dateRange(days, now = new Date()) {
  const count = [7, 30, 90].includes(Number(days)) ? Number(days) : 7;
  // Report calendar dates in Africa/Lagos (UTC+1), including today.
  const localDay = new Date(now.getTime() + 3600000).toISOString().slice(0, 10);
  const endDay = Date.parse(localDay + 'T00:00:00+01:00') + 86400000;
  return { days: count, start: new Date(endDay - count * 86400000).toISOString(), end: new Date(endDay).toISOString() };
}

export function summarize(rows, range, now = new Date()) {
  const sessions = new Set(rows.map(row => row.session_id));
  const unique = predicate => new Set(rows.filter(predicate).map(row => row.session_id)).size;
  const visitors = new Set(rows.map(row => row.visitor_id));
  const handoff = row => ['whatsapp_handoff', 'whatsapp_click'].includes(row.name);
  const count = name => rows.filter(row => row.name === name).length;
  const ranked = (key, filter = () => true, distinct = false) => {
    const values = new Map();
    rows.filter(filter).forEach(row => {
      const label = key(row);
      if (!label) return;
      if (distinct) { if (!values.has(label)) values.set(label, new Set()); values.get(label).add(row.session_id); }
      else values.set(label, (values.get(label) || 0) + 1);
    });
    return [...values].map(([label, value]) => ({ label, count: distinct ? value.size : value })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 12);
  };
  const daily = [];
  for (let i = 0; i < range.days; i++) {
    const start = Date.parse(range.start) + i * 86400000;
    const dayRows = rows.filter(row => Date.parse(row.occurred_at) >= start && Date.parse(row.occurred_at) < start + 86400000);
    daily.push({ date: new Date(start + 3600000).toISOString().slice(0, 10), visits: new Set(dayRows.map(row => row.session_id)).size, handoffs: dayRows.filter(handoff).length });
  }
  return {
    range, generatedAt: now.toISOString(),
    totals: { visitors: visitors.size, visits: sessions.size, pageViews: count('page_view'), planners: unique(row => row.name === 'planner_open'), handoffs: rows.filter(handoff).length, enquiryVisits: unique(handoff), conversion: sessions.size ? Math.round(unique(handoff) / sessions.size * 1000) / 10 : 0, active: unique(row => Date.parse(row.occurred_at) > now.getTime() - 5 * 60000) },
    daily,
    services: ranked(row => row.data.service, row => row.name === 'service_select'),
    destinations: ranked(row => row.data.destination, row => row.name === 'destination_select'),
    sources: ranked(row => row.source, () => true, true),
    devices: ranked(row => row.device, () => true, true),
    countries: ranked(row => row.country, () => true, true),
    placements: ranked(row => row.data.placement || 'planner', handoff),
    journey: [
      { label: 'Planner opened', count: unique(row => row.name === 'planner_open') },
      { label: 'Trip details', count: unique(row => row.name === 'planner_step_view' && row.data.step === 3) },
      { label: 'Contact details', count: unique(row => row.name === 'planner_step_view' && row.data.step === 4) },
      { label: 'WhatsApp handoff', count: unique(row => row.name === 'whatsapp_handoff') }
    ]
  };
}

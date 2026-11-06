import { cleanEvent, dateRange } from './model.mjs';
import { hashPassword, verifyPassword, makeSession, validSession, rateKey, cookieValue } from './security.mjs';

async function body(req) {
  if (req.body && typeof req.body === 'object') {
    if (Buffer.byteLength(JSON.stringify(req.body)) > 20000) throw new Error('Body too large');
    return req.body;
  }
  let text = ''; let bytes = 0;
  for await (const part of req) { bytes += Buffer.byteLength(part); if (bytes > 20000) throw new Error('Body too large'); text += part; }
  return JSON.parse(text || '{}');
}

export function createHandler({ store, settings, local = false, saveSettings, allowedOrigins }) {
  const cookieName = local ? 'viasky_admin' : '__Host-viasky_admin';
  const cookie = (token, age) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${local ? '' : '; Secure'}`;
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
    const action = new URL(req.url, 'http://localhost').searchParams.get('action') || 'status';
    const config = settings();
    const configured = !!(config.passwordHash && config.secret && store);
    if (!['GET', 'POST'].includes(req.method)) return send(405, { error: 'Method not allowed.' });
    if (req.method === 'POST' && (!req.headers.origin || !allowedOrigins.includes(req.headers.origin))) return send(403, { error: 'Origin not allowed.' });
    const authenticated = configured && validSession(cookieValue(req.headers.cookie, cookieName), config.secret);
    if (action === 'status' && req.method === 'GET') return send(200, { authenticated, configured, setupAvailable: local && !config.passwordHash, storage: local ? 'local' : 'production' });
    if (action === 'summary' && req.method === 'GET') {
      if (!authenticated) return send(401, { error: 'Please sign in.' });
      try { return send(200, await store.summary(dateRange(new URL(req.url, 'http://localhost').searchParams.get('days')))); }
      catch (_) { return send(503, { error: 'The analytics database is unavailable. Check the server settings and database migration.' }); }
    }
    if (req.method !== 'POST') return send(405, { error: 'Use POST for this action.' });
    if (action === 'logout') { res.setHeader('Set-Cookie', cookie('', 0)); return send(200, { ok: true }); }
    if (!['collect', 'login', 'setup'].includes(action)) return send(404, { error: 'Not found.' });
    if (action === 'setup' && (!local || config.passwordHash)) return send(403, { error: 'Local setup is unavailable.' });
    if (action !== 'setup' && !configured) return send(503, { error: 'Analytics is not connected yet.' });
    try {
      const ip = local ? req.socket.remoteAddress : (req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
      const scope = action === 'collect' ? 'collect' : 'login';
      const limit = scope === 'collect' ? 60 : 5;
      if (!await store.rate(rateKey(ip || 'unknown', config.secret, scope), limit, scope === 'collect' ? 60 : 900)) return send(429, { error: 'Too many requests. Try again later.' });
      const input = await body(req);
      if (action === 'setup') {
        const passwordHash = hashPassword(input.password);
        await saveSettings({ ...config, passwordHash });
        res.setHeader('Set-Cookie', cookie(makeSession(config.secret), 8 * 3600));
        return send(200, { ok: true });
      }
      if (action === 'login') {
        if (!verifyPassword(input.password, config.passwordHash)) return send(401, { error: 'That password was not recognised.' });
        res.setHeader('Set-Cookie', cookie(makeSession(config.secret), 8 * 3600));
        return send(200, { ok: true });
      }
      if (!Array.isArray(input.events) || input.events.length < 1 || input.events.length > 20) return send(400, { error: 'Invalid event batch.' });
      const agent = String(req.headers['user-agent'] || '');
      // Known crawlers are not visits. No raw IP or user-agent is stored with events.
      if (/bot|crawler|spider|headless/i.test(agent)) return send(200, { ok: true });
      const device = /ipad|tablet/i.test(agent) ? 'tablet' : /mobile|android|iphone/i.test(agent) ? 'mobile' : 'desktop';
      const country = local ? 'Unknown' : String(req.headers['x-vercel-ip-country'] || 'Unknown');
      const rows = input.events.map(event => cleanEvent(event, { device, country })).filter(Boolean);
      if (!rows.length) return send(400, { error: 'No valid analytics events.' });
      await store.insert(rows);
      return send(200, { ok: true });
    } catch (error) {
      const invalid = error instanceof SyntaxError || /Body too large|password between/.test(error.message);
      return send(invalid ? 400 : 503, { error: invalid ? 'Check the information and try again. Passwords must be 12–200 characters.' : 'Analytics is temporarily unavailable.' });
    }
  };
}

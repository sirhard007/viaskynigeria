import http from 'node:http';
import path from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { createHandler } from './handler.mjs';
import { localStore } from './store.mjs';
const root = path.resolve(import.meta.dirname, '..');
const data = path.join(root, '.data');
await mkdir(data, { recursive: true });
const settingsFile = path.join(data, 'local-settings.json');
let config;
try { config = JSON.parse(await readFile(settingsFile, 'utf8')); }
catch (_) {
  config = { secret: randomBytes(48).toString('hex'), passwordHash: '' };
  await writeFile(settingsFile, JSON.stringify(config), { mode: 0o600, flag: 'wx' });
}
const port = Number(process.env.PORT || 8766);
const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
const store = await localStore(path.join(data, 'analytics.sqlite'));
const handler = createHandler({ store, settings: () => config, local: true, allowedOrigins: origins, saveSettings: async next => {
  if (config.passwordHash) throw new Error('Local account already exists.');
  config = next;
  await writeFile(settingsFile, JSON.stringify(config), { mode: 0o600 });
} });
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const publicFiles = new Set(['index.html', 'privacy.html', 'analytics-config.js', 'analytics.js', 'analytics.css', 'styles.css', 'sections.css', 'site-layout.css', 'booking-modal.css', 'preloader.css', 'footer.css', 'script.js']);
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origins[0]);
    if (!origins.some(origin => new URL(origin).host === req.headers.host)) { res.writeHead(403).end('Host not allowed'); return; }
    if (url.pathname === '/api/analytics') { await handler(req, res); return; }
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    let file = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!file) file = 'index.html';
    if (file === 'admin/analytics' || file === 'admin/analytics/') file = 'admin/analytics.html';
    const target = path.resolve(root, file);
    const allowed = publicFiles.has(file) || /^assets\/[a-zA-Z0-9_./-]+\.(png|jpg|jpeg|svg|webp|ico)$/.test(file) || ['admin/analytics.html', 'admin/dashboard.js', 'admin/dashboard.css'].includes(file);
    if (!allowed || !target.startsWith(root + path.sep)) { res.writeHead(404).end('Not found'); return; }
    const content = await readFile(target);
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (file.startsWith('admin/')) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    }
    res.statusCode = 200; res.end(req.method === 'HEAD' ? undefined : content);
  } catch (_) { if (!res.headersSent) res.writeHead(404); res.end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`ViaSky local website: ${origins[0]}\nPrivate analytics: ${origins[0]}/admin/analytics\nLocal database only. Production traffic is separate.`));

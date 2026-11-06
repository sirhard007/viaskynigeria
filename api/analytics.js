import { createHandler } from '../server/handler.mjs';
import { SupabaseStore } from '../server/store.mjs';

let handler;
export default async function analytics(req, res) {
  if (!handler) {
    let store;
    try { store = new SupabaseStore(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY); } catch (_) { store = null; }
    const secret = process.env.ANALYTICS_SESSION_SECRET || '';
    handler = createHandler({
      store,
      settings: () => ({ passwordHash: process.env.ANALYTICS_ADMIN_PASSWORD_HASH || '', secret: secret.length >= 32 ? secret : '' }),
      allowedOrigins: (process.env.ANALYTICS_ALLOWED_ORIGINS || 'https://viaskynigeria.com,https://www.viaskynigeria.com').split(',').map(value => value.trim()).filter(Boolean)
    });
  }
  return handler(req, res);
}

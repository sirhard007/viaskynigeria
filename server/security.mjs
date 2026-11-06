import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) throw new Error('Use a password between 12 and 200 characters.');
  const salt = randomBytes(16).toString('hex');
  return 'scrypt:' + salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
export function verifyPassword(password, encoded = '') {
  if (typeof password !== 'string' || password.length > 200) return false;
  const [kind, salt, digest] = encoded.split(':');
  if (kind !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(digest || '')) return false;
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(digest, 'hex'));
}
const sign = (value, secret) => createHmac('sha256', secret).update(value).digest('base64url');
export function makeSession(secret, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ exp: now + 8 * 3600000, nonce: randomBytes(16).toString('hex') })).toString('base64url');
  return body + '.' + sign(body, secret);
}
export function validSession(token = '', secret, now = Date.now()) {
  if (!secret || token.length > 500) return false;
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra) return false;
  const expected = Buffer.from(sign(body, secret));
  const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return false;
  try { const exp = JSON.parse(Buffer.from(body, 'base64url').toString()).exp; return Number.isFinite(exp) && exp > now && exp <= now + 8 * 3600000; } catch (_) { return false; }
}
export function rateKey(ip, secret, scope) { return createHmac('sha256', secret).update(scope + ':' + ip).digest('hex'); }
export function cookieValue(header = '', name) {
  return header.split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))?.slice(name.length + 1) || '';
}

import {
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../config.js';

const derive = promisify(scrypt);
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, options);
  return `scrypt$131072$8$1$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  const parts = (encoded || '').split('$');
  const valid =
    parts.length === 6 &&
    parts.slice(0, 4).join('$') === 'scrypt$131072$8$1' &&
    /^[a-f0-9]{32}$/.test(parts[4]) &&
    /^[a-f0-9]{128}$/.test(parts[5]);
  const key = await derive(password, valid ? parts[4] : '0'.repeat(32), 64, options);
  return valid && timingSafeEqual(key, Buffer.from(parts[5], 'hex'));
}

export const tokenDigest = (token) => createHash('sha256').update(token).digest('hex');

export const keyedDigest = (value) =>
  createHmac('sha256', config.auth.otpSecret).update(value).digest('hex');

export const codeDigest = (id, code) => keyedDigest(`${id}:${code}`);

export function equalDigest(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

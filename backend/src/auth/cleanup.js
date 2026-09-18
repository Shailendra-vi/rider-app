import { pathToFileURL } from 'node:url';
import { pool } from '../db/pool.js';

export async function cleanupAuth() {
  const challenges = await pool.query(
    "DELETE FROM rider_auth_challenges WHERE created_at < now() - interval '1 day'",
  );
  const sessions = await pool.query(
    'DELETE FROM rider_sessions WHERE expires_at <= now() OR revoked_at IS NOT NULL',
  );
  const limits = await pool.query(
    'DELETE FROM rider_auth_limits WHERE expires_at <= now()',
  );
  return {
    challenges: challenges.rowCount,
    sessions: sessions.rowCount,
    limits: limits.rowCount,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cleanupAuth()
    .then((counts) => console.log('Auth cleanup complete', counts))
    .catch(() => {
      console.error('Auth cleanup failed');
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

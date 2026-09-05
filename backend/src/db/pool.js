import pg from 'pg';
import { config } from '../config.js';

pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

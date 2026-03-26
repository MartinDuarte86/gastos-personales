const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_DRIVER = (process.env.DB_DRIVER || '').trim().toLowerCase();
const IS_PROD = process.env.NODE_ENV === 'production';

function normalizeDriver() {
  if (DB_DRIVER === 'postgres' || DB_DRIVER === 'postgresql') return 'postgres';
  if (DB_DRIVER === 'sqlite') return 'sqlite';
  if (IS_PROD) return 'postgres';
  return 'sqlite';
}

function toPgPlaceholders(sql) {
  let idx = 0;
  return String(sql).replace(/\?/g, () => {
    idx += 1;
    return `$${idx}`;
  });
}

function inferLastId(row = {}) {
  if (!row || typeof row !== 'object') return undefined;
  const preferred = ['id', 'id_transaccion', 'id_sector', 'id_activo'];
  for (const key of preferred) {
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  }
  const anyId = Object.keys(row).find((k) => /^id/i.test(k));
  return anyId ? row[anyId] : undefined;
}

function createPostgresAdapter() {
  const { Pool } = require('pg');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for postgres driver');
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
  });

  function run(sql, params, callback) {
    const hasParams = Array.isArray(params);
    const values = hasParams ? params : [];
    const cb = hasParams ? callback : params;
    const text = toPgPlaceholders(sql);
    const shouldReturn = /^\s*insert\s+/i.test(text) && !/\breturning\b/i.test(text);
    const queryText = shouldReturn ? `${text} RETURNING *` : text;

    const promise = pool.query(queryText, values);
    if (typeof cb === 'function') {
      promise
        .then((result) => {
          cb.call(
            {
              changes: result.rowCount || 0,
              lastID: inferLastId(result.rows?.[0])
            },
            null
          );
        })
        .catch((err) => {
          cb.call({ changes: 0, lastID: undefined }, err);
        });
      return;
    }
    return promise;
  }

  function get(sql, params, callback) {
    const hasParams = Array.isArray(params);
    const values = hasParams ? params : [];
    const cb = hasParams ? callback : params;
    const promise = pool.query(toPgPlaceholders(sql), values);
    if (typeof cb === 'function') {
      promise
        .then((result) => cb(null, result.rows?.[0] || undefined))
        .catch((err) => cb(err));
      return;
    }
    return promise.then((result) => result.rows?.[0] || undefined);
  }

  function all(sql, params, callback) {
    const hasParams = Array.isArray(params);
    const values = hasParams ? params : [];
    const cb = hasParams ? callback : params;
    const promise = pool.query(toPgPlaceholders(sql), values);
    if (typeof cb === 'function') {
      promise
        .then((result) => cb(null, result.rows || []))
        .catch((err) => cb(err));
      return;
    }
    return promise.then((result) => result.rows || []);
  }

  function exec(sql, callback) {
    const promise = pool.query(String(sql));
    if (typeof callback === 'function') {
      promise.then(() => callback(null)).catch((err) => callback(err));
      return;
    }
    return promise;
  }

  function serialize(fn) {
    if (typeof fn === 'function') fn();
  }

  async function bootstrapFromSqlFile(filePath) {
    const fullPath = path.resolve(filePath);
    if (!fs.existsSync(fullPath)) return;
    const sql = fs.readFileSync(fullPath, 'utf8');
    if (!sql.trim()) return;
    await pool.query(sql);
  }

  return {
    driver: 'postgres',
    db: { run, get, all, exec, serialize },
    pool,
    bootstrapFromSqlFile
  };
}

function createSqliteAdapter() {
  const DB_PATH = path.join(__dirname, '..', 'tareas.db');
  const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Error opening SQLite database:', err.message);
      process.exit(1);
    }
    require('./migrate')(db, () => {
      console.log('SQLite ready and fully migrated at', DB_PATH);
    });
  });
  return { driver: 'sqlite', db, dbPath: DB_PATH };
}

function initDb() {
  const driver = normalizeDriver();
  if (driver === 'postgres') {
    const pgAdapter = createPostgresAdapter();
    if (process.env.AUTO_DB_BOOTSTRAP === 'true') {
      pgAdapter.bootstrapFromSqlFile(path.join(__dirname, 'postgres', '001_bootstrap.sql'))
        .then(() => {
          console.log('PostgreSQL bootstrap checked from database/postgres/001_bootstrap.sql');
        })
        .catch((err) => {
          console.error('PostgreSQL bootstrap failed:', err.message);
          process.exit(1);
        });
    }
    return pgAdapter;
  }
  return createSqliteAdapter();
}

module.exports = { initDb };

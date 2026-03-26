require('dotenv').config();
const { Pool } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is missing');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined
  });

  try {
    const result = await pool.query('SELECT NOW() AS now, current_database() AS db, current_user AS user_name');
    console.log('Neon connection OK:', result.rows[0]);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Neon connection FAILED:', err.message);
  process.exit(1);
});

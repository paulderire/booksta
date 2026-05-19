const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const isProduction = process.env.NODE_ENV === 'production';

const ssl = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
  ? false
  : isProduction
    ? { rejectUnauthorized: false }
    : false;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/booksta',
  ssl,
  // Production connection pooling optimizations
  max: isProduction ? 20 : 10,
  idleTimeoutMillis: isProduction ? 10000 : 30000,
  connectionTimeoutMillis: isProduction ? 5000 : 5000,
  statement_timeout: isProduction ? 30000 : 30000,
  maxUses: isProduction ? 7500 : undefined,
  // Enable client connection recovery
  errorHandler: (err, _client) => {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      console.error('Database connection error:', err.message);
    }
  }
});

async function query(text, params) {
  return pool.query(text, params);
}

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  withTransaction
};
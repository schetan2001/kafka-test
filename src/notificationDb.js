const { Pool } = require('pg');

const notificationDbPool = new Pool({
  host: process.env.NOTIFICATION_DB_HOST || 'localhost',
  port: parseInt(process.env.NOTIFICATION_DB_PORT, 10) || 5432,
  database: process.env.NOTIFICATION_DB_NAME || 'c2c_notification_db',
  user: process.env.NOTIFICATION_DB_USER || 'postgres',
  password: process.env.NOTIFICATION_DB_PASSWORD || '',
  ssl: {
    rejectUnauthorized: false
  }
});

notificationDbPool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL (Notification DB)');
});

notificationDbPool.on('error', (err) => {
  console.error('❌ PostgreSQL Notification pool error:', err.message);
});

module.exports = notificationDbPool;

const { Pool } = require("pg");

const sslConfig = { rejectUnauthorized: false };

const poolDefaults = {
  ssl: sslConfig,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

const vehiclePool = new Pool({
  ...poolDefaults,
  host: process.env.VEHICLE_DB_HOST,
  port: parseInt(process.env.VEHICLE_DB_PORT) || 5432,
  user: process.env.VEHICLE_DB_USER,
  password: process.env.VEHICLE_DB_PASSWORD,
  database: "c2c_device_registration_service_db",
});

const telemetryPool = new Pool({
  ...poolDefaults,
  host: process.env.TELEMETRY_DB_HOST,
  port: parseInt(process.env.TELEMETRY_DB_PORT) || 5432,
  user: process.env.TELEMETRY_DB_USER,
  password: process.env.TELEMETRY_DB_PASSWORD,
  database: "c2c_telemetry_db",
});

const diagnosticPool = new Pool({
  ...poolDefaults,
  host: process.env.DIAGNOSTIC_DB_HOST,
  port: parseInt(process.env.DIAGNOSTIC_DB_PORT) || 5432,
  user: process.env.DIAGNOSTIC_DB_USER,
  password: process.env.DIAGNOSTIC_DB_PASSWORD,
  database: "c2c_vehicle_diagnostic_db",
});

module.exports = { vehiclePool, telemetryPool, diagnosticPool };

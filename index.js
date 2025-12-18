require("dotenv").config();
const { Kafka } = require("kafkajs");
const { Pool } = require("pg");

// --- Configuration ---
const KAFKA_BROKER = process.env.KAFKA_BROKER;
const KAFKA_OUTPUT_TOPIC = process.env.KAFKA_OUTPUT_TOPIC;
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS, 10);
const POLL_COLUMN = "updated_at"; // The column used to detect new/updated rows.

// --- PostgreSQL Client Pool ---
const pgPool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});

// --- Kafka Producer ---
const kafka = new Kafka({
  clientId: "postgres-to-kafka-producer",
  brokers: [KAFKA_BROKER],
});
const producer = kafka.producer();

// --- Main Application Logic ---
let lastPollValue = new Date(0); // Start from the beginning of time.

/**
 * Queries the database for new/updated rows and publishes them to Kafka.
 */
async function pollAndPublish() {
  console.log(`Polling for rows in 'ota.t_campaign' where '${POLL_COLUMN}' > ${lastPollValue.toISOString()}`);
  
  try {
    const query = `SELECT * FROM ota.t_campaign WHERE ${POLL_COLUMN} > $1 ORDER BY ${POLL_COLUMN} ASC`;
    const { rows } = await pgPool.query(query, [lastPollValue]);

    if (rows.length === 0) {
      console.log("No new rows found.");
      return;
    }

    console.log(`Found ${rows.length} new/updated row(s). Publishing to Kafka...`);

    const messages = rows.map(row => ({
      key: String(row.id), // Assuming 'id' is the primary key for partitioning.
      value: JSON.stringify(row),
    }));

    await producer.send({
      topic: KAFKA_OUTPUT_TOPIC,
      messages: messages,
    });

    // Update the last poll value to the latest timestamp from the processed batch.
    lastPollValue = rows[rows.length - 1][POLL_COLUMN];
    console.log(`Successfully published ${rows.length} message(s). New poll value is ${lastPollValue.toISOString()}`);

  } catch (error) {
    console.error("An error occurred during polling and publishing:", error);
  }
}

/**
 * Starts the service, connects to dependencies, and begins the polling loop.
 */
async function startService() {
  try {
    // Connect to Kafka Producer
    await producer.connect();
    console.log("Kafka producer connected.");

    // Test PostgreSQL connection
    const client = await pgPool.connect();
    console.log("PostgreSQL pool connected.");
    client.release();

    // Start the polling loop
    console.log(`Starting polling every ${POLL_INTERVAL_MS / 1000} seconds.`);
    setInterval(pollAndPublish, POLL_INTERVAL_MS);

  } catch (error) {
    console.error("Failed to start the service:", error);
    process.exit(1);
  }
}

// --- Graceful Shutdown ---
async function shutdown() {
  console.log("Shutting down service...");
  try {
    await producer.disconnect();
    await pgPool.end();
    console.log("Service shut down gracefully.");
  } catch (error) {
    console.error("Error during shutdown:", error);
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

startService();
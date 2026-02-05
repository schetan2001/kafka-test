require("dotenv").config();
const { Kafka } = require("kafkajs");

// --- Configuration ---
const KAFKA_BROKER = process.env.KAFKA_BROKER;
const INPUT_TOPIC = process.env.INPUT_TOPIC;
const OUTPUT_TOPIC = process.env.OUTPUT_TOPIC;
const TARGET_SYSTEM_ID = process.env.TARGET_SYSTEM_ID;

if (!KAFKA_BROKER || !INPUT_TOPIC || !OUTPUT_TOPIC || !TARGET_SYSTEM_ID) {
  throw new Error(
    "Missing required environment variables: KAFKA_BROKER, INPUT_TOPIC, OUTPUT_TOPIC, TARGET_SYSTEM_ID"
  );
}

// --- Kafka Client Setup ---
const kafka = new Kafka({
  clientId: "kafka-filter-service",
  brokers: [KAFKA_BROKER],
});

const consumer = kafka.consumer({ groupId: "kafka-filter-group" });
const producer = kafka.producer();

/**
 * Processes a raw Kafka message, checks for the target system_id,
 * and forwards it if it matches.
 * @param {object} message - The raw Kafka message from the consumer.
 */
async function processMessage(message) {
  let inputPayload;
  const messageValue = message.value.toString();

  try {
    inputPayload = JSON.parse(messageValue);
  } catch (err) {
    console.error("Failed to parse incoming message as JSON:", err.message);
    return; // Ignore non-JSON messages
  }

  if (inputPayload?.cbp_a2a_header?.system_id === TARGET_SYSTEM_ID) {
    try {
      await producer.send({
        topic: OUTPUT_TOPIC,
        messages: [{ value: messageValue }],
      });
      console.log(
        `Forwarded message for target system_id: ${TARGET_SYSTEM_ID}`
      );
    } catch (err) {
      console.error("Failed to forward message to output topic:", err);
    }
  }
}

async function start() {
  try {
    await producer.connect();
    await consumer.connect();
    await consumer.subscribe({ topic: INPUT_TOPIC, fromBeginning: false });

    console.log(`Connected to Kafka. Listening on topic: "${INPUT_TOPIC}"`);
    console.log(`Filtering for system_id: "${TARGET_SYSTEM_ID}"`);
    console.log(`Forwarding matches to topic: "${OUTPUT_TOPIC}"`);

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        await processMessage(message);
      },
    });
  } catch (error) {
    console.error("An error occurred with the Kafka service:", error);
    process.exit(1);
  }
}

start();

// Graceful shutdown
const errorTypes = ["unhandledRejection", "uncaughtException"];
const signalTraps = ["SIGTERM", "SIGINT", "SIGUSR2"];

errorTypes.forEach((type) => {
  process.on(type, async (e) => {
    try {
      console.log(`process.on ${type}`);
      console.error(e);
      await producer.disconnect();
      await consumer.disconnect();
      process.exit(0);
    } catch (_) {
      process.exit(1);
    }
  });
});

signalTraps.forEach((type) => {
  process.once(type, async () => {
    try {
      await producer.disconnect();
      await consumer.disconnect();
    } finally {
      process.kill(process.pid, type);
    }
  });
});
require("dotenv").config();
const { Kafka } = require("kafkajs");

// --- Configuration ---
const KAFKA_BROKER = process.env.KAFKA_BROKER;
const INPUT_TOPIC = process.env.INPUT_TOPIC;
const OUTPUT_TOPIC = process.env.OUTPUT_TOPIC;

// --- DTC Rules Definition ---
// A Map for efficient lookups using Property_ID as the key.
const dtcRules = new Map([
  [557875431, { dtcCode: "P10501", description: "AC input voltage above the operating voltage" }],
  [557875432, { dtcCode: "P10502", description: "AC input voltage below the operating voltage" }],
  [557875433, { dtcCode: "P10503", description: "AC input current below the operating voltage" }],
  [557875434, { dtcCode: "P10504", description: "OBC Output DC Current above the operating current" }],
  [557875435, { dtcCode: "P10505", description: "OBC Temperature above the operating temperature" }],
  [557875436, { dtcCode: "P10506", description: "OBC Temperature below the operating temperature" }],
  [557875437, { dtcCode: "P10507", description: "OBC Temperature sensor value above or below the operating value" }],
  [557875438, { dtcCode: "P10508", description: "OBC Current senor value above or below the operating value" }],
  [557875439, { dtcCode: "P10509", description: "OBC output contactor / relay welded or not closing" }],
  [557875440, { dtcCode: "P1050A", description: "OBC output connector not connected with battery" }],
]);

// --- Kafka Client Setup ---
const kafka = new Kafka({
  clientId: "dtc-processor-service",
  brokers: [KAFKA_BROKER],
});

const consumer = kafka.consumer({ groupId: "dtc-processor-group" });
const producer = kafka.producer();

/**
 * Processes a raw Kafka message, identifies active DTCs, and builds a snapshot.
 * @param {object} message - The raw Kafka message.
 */
async function processMessage(message) {
  let inputPayload;
  try {
    inputPayload = JSON.parse(message.value.toString());
  } catch (err) {
    console.error("Failed to parse incoming message as JSON:", err.message);
    return;
  }

  const responseData = inputPayload.responseData;
  if (!responseData || !responseData.systemId || !Array.isArray(responseData.signals)) {
    console.warn("Skipping message with invalid format. Missing systemId or signals array.");
    return;
  }

  const { systemId, signals } = responseData;
  const dtcSnapshot = [];
  let eventTimestamp = null;

  // Iterate through each signal in the incoming message
  for (const signal of signals) {
    // Check if a rule exists for this signal's ID and if its value indicates an error ("1")
    if (dtcRules.has(signal.id) && String(signal.value) === "1") {
      const rule = dtcRules.get(signal.id);

      dtcSnapshot.push({
        dtcCode: rule.dtcCode,
        dtcDescription: rule.description,
        status: "Active",
        triggerSignal: signal.name,
        triggerValue: String(signal.value),
      });

      // Use the timestamp from the first triggering signal
      if (!eventTimestamp) {
        eventTimestamp = signal.updatedTime;
      }
    }
  }

  // Only publish if at least one active DTC was found
  if (dtcSnapshot.length > 0) {
    const outputMessage = {
      systemId: systemId,
      timestamp: eventTimestamp || Date.now(), // Fallback to current time
      dtcSnapshot: dtcSnapshot,
      activeDtcCount: dtcSnapshot.length,
    };

    await producer.send({
      topic: OUTPUT_TOPIC,
      messages: [{ value: JSON.stringify(outputMessage, null, 2) }],
    });

    console.log(`Published ${outputMessage.activeDtcCount} active DTC(s) for systemId: ${systemId}`);
  }
}

/**
 * Starts the Kafka consumer and producer.
 */
async function start() {
  try {
    await producer.connect();
    await consumer.connect();
    await consumer.subscribe({ topic: INPUT_TOPIC, fromBeginning: false });

    console.log(`Connected to Kafka. Listening on topic: "${INPUT_TOPIC}"`);

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
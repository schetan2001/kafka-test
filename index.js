require("dotenv").config();
const { Kafka } = require("kafkajs");

// --- Configuration ---
const KAFKA_BROKER = process.env.KAFKA_BROKER;
const INPUT_TOPIC = process.env.INPUT_TOPIC;
const OUTPUT_TOPIC = process.env.OUTPUT_TOPIC;

// --- DTC Rules Definition for event_type 6506 ---
// A Map for efficient lookups using Property_ID as the key.
const dtcRules = new Map([
  [557875737, { dtcCode: "U0101", description: "BMS Heartbeat Not received to VCU" }],
  [557875738, { dtcCode: "U0102", description: "MCU Heartbeat Not received to VCU" }],
  [557875739, { dtcCode: "U0103", description: "OBC Heartbeat Not received to VCU" }],
  [557875690, { dtcCode: "U0104", description: "CAN Frame not receieved from ABS IMU to VCU" }],
  [557875443, { dtcCode: "P0A01", description: "Low Voltage in OBC Output" }],
  [557875640, { dtcCode: "P0A02", description: "Battery Dischage Fuse Failed" }],
  [557875643, { dtcCode: "P0A03", description: "High volatge Interlock loop error" }],
  [557875626, { dtcCode: "U0105", description: "OBC CAN Disconnected" }],
]);

// --- Kafka Client Setup ---
const kafka = new Kafka({
  clientId: "dtc-processor-service",
  brokers: [KAFKA_BROKER],
});

const consumer = kafka.consumer({ groupId: "dtc-processor-group" });
const producer = kafka.producer();

/**
 * Processes a raw Kafka message, identifies all relevant DTCs, and builds a snapshot.
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

  // Validate new message structure
  if (!inputPayload.meta?.system_id || !Array.isArray(inputPayload.telemetry)) {
    console.warn("Skipping message with invalid format. Missing meta.system_id or telemetry array.");
    return;
  }

  const systemId = inputPayload.meta.system_id;
  const dtcSnapshot = [];
  let eventTimestamp = null;

  // Iterate through each telemetry event in the message
  for (const telemetryEvent of inputPayload.telemetry) {
    // Only process events with event_type 6506
    if (telemetryEvent.event_type !== 6506 || !Array.isArray(telemetryEvent.data)) {
      continue;
    }

    // Use the timestamp from the first valid telemetry event
    if (!eventTimestamp) {
      eventTimestamp = telemetryEvent.time;
    }

    // Iterate through each data point in the telemetry event
    for (const signal of telemetryEvent.data) {
      if (dtcRules.has(signal.id)) {
        const rule = dtcRules.get(signal.id);
        // The value is the first element in the 'value' array
        const signalValue = String(signal.value?.[0] ?? "0");

        // Dynamically set the status based on the signal's value.
        const status = signalValue === "1" ? "Active" : "Inactive";

        dtcSnapshot.push({
          dtcCode: rule.dtcCode,
          dtcDescription: rule.description,
          status: status,
          triggerSignal: `ID_${signal.id}`, // Signal name is not provided in the new format
          triggerValue: signalValue,
        });
      }
    }
  }

  // Only publish if at least one DTC (active or inactive) was found
  if (dtcSnapshot.length > 0) {
    // Count how many of the found DTCs are actually active.
    const activeDtcCount = dtcSnapshot.filter(dtc => dtc.status === "Active").length;

    const outputMessage = {
      systemId: systemId,
      timestamp: eventTimestamp || Date.now(), // Fallback to current time
      dtcSnapshot: dtcSnapshot,
      activeDtcCount: activeDtcCount,
    };

    await producer.send({
      topic: OUTPUT_TOPIC,
      messages: [{ value: JSON.stringify(outputMessage, null, 2) }],
    });

    console.log(`Published snapshot with ${dtcSnapshot.length} total DTCs (${activeDtcCount} active) for systemId: ${systemId}`);
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
require("dotenv").config();
const { Kafka } = require("kafkajs");

const INPUT_TOPIC = process.env.INPUT_TOPIC;
const OUTPUT_TOPIC = process.env.OUTPUT_TOPIC;
const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";

const kafka = new Kafka({
  clientId: "alert-transform",
  brokers: [KAFKA_BROKER]
});

const consumer = kafka.consumer({ groupId: "alert-transform-group" });
const producer = kafka.producer();

// Track alert counts per VIN for D1/D2
const alertCounter = {};

async function start() {
  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({ topic: INPUT_TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      let input;
      try {
        input = JSON.parse(message.value.toString());
      } catch (err) {
        console.error("Invalid JSON received:", err.message);
        return;
      }

      const { vin, alert } = input;
      if (!vin || !alert) return;

      if (alert === "D0") {
        // Publish immediately
        await producer.send({
          topic: OUTPUT_TOPIC,
          messages: [{ value: JSON.stringify({ vin, alert }) }]
        });
        console.log(`Published D0 alert for VIN ${vin}`);
      } else if (alert === "D1" || alert === "D2") {
        // Track occurrences per VIN
        const key = `${vin}_${alert}`;
        alertCounter[key] = (alertCounter[key] || 0) + 1;
        if (alertCounter[key] === 8) {
          await producer.send({
            topic: OUTPUT_TOPIC,
            messages: [{ value: JSON.stringify({ vin, alert }) }]
          });
          console.log(`Published ${alert} alert for VIN ${vin} on 8th occurrence`);
          alertCounter[key] = 0;
        }
      }
    }
  });
}

start().catch(console.error);
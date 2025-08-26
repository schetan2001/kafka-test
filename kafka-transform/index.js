require("dotenv").config();
const { Kafka } = require("kafkajs");

const INPUT_TOPIC = process.env.INPUT_TOPIC;
const OUTPUT_TOPIC = process.env.OUTPUT_TOPIC;
const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";

// Key-value pairs from env
const KEY1 = process.env.KEY1;
const VALUE1 = process.env.VALUE1;
const KEY2 = process.env.KEY2;
const VALUE2 = process.env.VALUE2;
const KEY3 = process.env.KEY3;
const VALUE3 = process.env.VALUE3;

const kafka = new Kafka({
  clientId: "kafka-transform",
  brokers: [KAFKA_BROKER]
});

const consumer = kafka.consumer({ groupId: "kafka-transform-group" });
const producer = kafka.producer();

async function start() {
  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({ topic: INPUT_TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      // Build new JSON body from env key-value pairs
      const outputPayload = {
        [KEY1]: VALUE1,
        [KEY2]: VALUE2,
        [KEY3]: VALUE3
      };

      await producer.send({
        topic: OUTPUT_TOPIC,
        messages: [
          { value: JSON.stringify(outputPayload) }
        ]
      });

      console.log("Published to output topic:", outputPayload);
    }
  });
}

start().catch(console.error);
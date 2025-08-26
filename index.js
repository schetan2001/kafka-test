require("dotenv").config();
const { Kafka } = require("kafkajs");

const INPUT_TOPIC = process.env.INPUT_TOPIC;
const OUTPUT_TOPIC = process.env.OUTPUT_TOPIC;
const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";

const KEY1 = process.env.KEY1;
const KEY2 = process.env.KEY2;
const KEY3 = process.env.KEY3;

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
      let input;
      try {
        input = JSON.parse(message.value.toString());
      } catch (err) {
        console.error("Invalid JSON received:", err.message);
        return;
      }

      // Build new JSON body using only the specified keys
      const outputPayload = {
        [KEY1]: input[KEY1],
        [KEY2]: input[KEY2],
        [KEY3]: input[KEY3]
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
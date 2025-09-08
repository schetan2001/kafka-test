require("dotenv").config();
const { Kafka } = require("kafkajs");
const { MongoClient } = require("mongodb");

const {
  KAFKA_BROKER,
  KAFKA_INPUT_TOPIC,
  MONGO_USERNAME,
  MONGO_PASSWORD,
  MONGO_HOST,
  MONGO_DB,
  MONGO_COLLECTION
} = process.env;

// ===== MongoDB connection string =====
const mongoUri = `mongodb+srv://${MONGO_USERNAME}:${encodeURIComponent(MONGO_PASSWORD)}@${MONGO_HOST}/${MONGO_DB}?authSource=admin`;

let db;

// Connect to MongoDB
MongoClient.connect(mongoUri, { useUnifiedTopology: true })
  .then((client) => {
    console.log(" Connected to MongoDB");
    db = client.db(MONGO_DB);
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// ===== Kafka setup =====
const kafka = new Kafka({
  clientId: "kafka-to-mongodb",
  brokers: [KAFKA_BROKER]
});

const consumer = kafka.consumer({ groupId: "kafka-to-mongodb-group" });

async function start() {
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_INPUT_TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const data = JSON.parse(message.value.toString());
        // Insert into MongoDB
        await db.collection(MONGO_COLLECTION).insertOne(data);
        console.log(`Inserted into MongoDB:`, data);
      } catch (err) {
        console.error("Error processing Kafka message:", err);
      }
    }
  });
}

start().catch(console.error);
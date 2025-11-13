require("dotenv").config();
const { Kafka } = require("kafkajs");
const { MongoClient } = require("mongodb");

// --- Configuration ---
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME;
const COLLECTION_NAME = process.env.COLLECTION_NAME;
const KAFKA_BROKER = process.env.KAFKA_BROKER;
const KAFKA_TOPIC = process.env.KAFKA_TOPIC;

// --- Service Clients ---
const kafka = new Kafka({
  clientId: "mongo-producer",
  brokers: [KAFKA_BROKER],
});
const producer = kafka.producer();
const mongoClient = new MongoClient(MONGO_URI);

/**
 * Connects to MongoDB, fetches all documents from the specified collection,
 * and sends each document as a message to a Kafka topic.
 */
const processData = async () => {
  try {
    // 1. Connect services
    console.log("Connecting to Kafka producer...");
    await producer.connect();
    console.log("Kafka producer connected.");

    console.log("Connecting to MongoDB...");
    await mongoClient.connect();
    console.log("MongoDB connected.");

    // 2. Get data from MongoDB
    const database = mongoClient.db(DB_NAME);
    const collection = database.collection(COLLECTION_NAME);
    const cursor = collection.find({});

    console.log(`Found documents in ${DB_NAME}.${COLLECTION_NAME}. Starting to produce to Kafka...`);

    // 3. Iterate and produce to Kafka
    let messageCount = 0;
    for await (const doc of cursor) {
      // The _id field from MongoDB is an ObjectId, which needs to be converted to a string for clean JSON.
      const payload = { ...doc, _id: doc._id.toString() };
      
      await producer.send({
        topic: KAFKA_TOPIC,
        messages: [{ value: JSON.stringify(payload) }],
      });
      messageCount++;
    }

    console.log(`Successfully produced ${messageCount} messages to topic '${KAFKA_TOPIC}'.`);

  } catch (error) {
    console.error("An error occurred during processing:", error);
  } finally {
    // 4. Disconnect services
    console.log("Disconnecting Kafka producer...");
    await producer.disconnect();
    console.log("Disconnecting from MongoDB...");
    await mongoClient.close();
  }
};

// Run the process
processData().catch(console.error);
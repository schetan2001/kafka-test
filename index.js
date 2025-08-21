require("dotenv").config();
const kafka = require("kafka-node");
const { MongoClient } = require("mongodb");

const {
  KAFKA_BOOTSTRAP_SERVER_URL,
  KAFKA_PRODUCER_TOPIC,
  KAFKA_INPUT_TOPIC,
  KAFKA_CONSUMER_GROUP,
  MONGO_USERNAME,
  MONGO_PASSWORD,
  MONGO_HOST,
  MONGO_PORT,
  MONGO_DB,
  MONGO_COLLECTION
} = process.env;

// ===== MongoDB connection string =====
const mongoUri = `mongodb+srv://${MONGO_USERNAME}:${encodeURIComponent(MONGO_PASSWORD)}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}?authSource=admin`;

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
const kafkaClient = new kafka.KafkaClient({ kafkaHost: KAFKA_BOOTSTRAP_SERVER_URL });
const consumer = new kafka.ConsumerGroup(
  {
    kafkaHost: KAFKA_BOOTSTRAP_SERVER_URL,
    groupId: KAFKA_CONSUMER_GROUP,
    autoCommit: true,
  },
  [KAFKA_INPUT_TOPIC]
);
const producer = new kafka.Producer(kafkaClient);

// ===== Kafka consumer logic =====
consumer.on("message", async (message) => {
  try {
    const incomingData = JSON.parse(message.value);
    const deviceId = incomingData?.meta?.device_id;

    if (!deviceId) {
      console.warn(" No device_id found in message:", message.value);
      return;
    }

    // Fetch from MongoDB
    const metaData = await db.collection(MONGO_COLLECTION).findOne(
      { device_id: deviceId },
      { projection: { _id: 0 } }
    );

    if (!metaData) {
      console.warn(` No Mongo data found for device_id ${deviceId}`);
      return;
    }

    // Merge Mongo record into payload
    const enrichedPayload = {
      ...incomingData,
      user_meta: metaData,
    };

    // Debug print
    console.log(` Enriched payload for ${deviceId}:`, JSON.stringify(enrichedPayload, null, 2));

    // Produce enriched payload
    producer.send(
      [{ topic: KAFKA_PRODUCER_TOPIC, messages: JSON.stringify(enrichedPayload) }],
      (err, data) => {
        if (err) {
          console.error("Error sending enriched payload:", err);
        } else {
          console.log(` Enriched payload sent for ${deviceId}:`, data);
        } 
      }
    );
  } catch (err) {
    console.error(" Error processing Kafka message:", err);
  }
});

producer.on("ready", () => console.log("Kafka Producer ready"));
producer.on("error", (err) => console.error(" Producer error:", err));

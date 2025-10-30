const dotenv = require("dotenv");
dotenv.config();
const { Kafka } = require("kafkajs");
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// Env vars
const API_KEY = process.env.API_KEY;
const BACKEND_APIS = [process.env.PROCESS_API_URL];
const PORT = process.env.PORT;

// Common util
function epochToDateTime(epoch) {
  const date = new Date(Number(epoch) * 1000);
  return date.toLocaleString("en-GB", { 
    day: "2-digit", month: "long", year: "numeric", 
    hour: "2-digit", minute: "2-digit", second: "2-digit" 
  }).replace(",", "");
}

function transformData(input) {
  const output = { ...input };
  if (output.timestamp) {
    output.timestamp = epochToDateTime(output.timestamp);
  }
  return output;
}

function convertTimestampsInObject(obj) {
  if (Array.isArray(obj)) {
    return obj.map(convertTimestampsInObject);
  } else if (obj && typeof obj === "object") {
    const newObj = {};
    for (const key in obj) {
      const value = obj[key];
      if (typeof value === "number") {
        if (key.toLowerCase().includes("timestamp")) {
          newObj[key] = epochToDateTime(value);
        } else if (key.toLowerCase() === "speed") {
          newObj[key] = (value / 3.6).toFixed(2) + " m/s"; // km/h → m/s
        } else {
          newObj[key] = value;
        }
      } else {
        newObj[key] = convertTimestampsInObject(value);
      }
    }
    return newObj;
  }
  return obj;
}

app.use((req, res, next) => {
  const clientKey = req.headers["x-api-key"];
  if (!clientKey || clientKey !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

app.post("/responsetransform", async (req, res) => {
  const { timestamp, imei } = req.body;
  if (!timestamp || !imei) {
    return res.status(400).json({ error: "timestamp and imei are required" });
  }

  const payload = { timestamp, imei };
  try {
    const responses = await Promise.all(
      BACKEND_APIS.map(url =>
        axios.post(url, payload, { timeout: 5000 })
          .then(r => r.data)
          .catch(e => ({ error: e.message }))
      )
    );

    const transformed = convertTimestampsInObject(responses[0]);
    console.log("Transformed API response:", JSON.stringify(transformed, null, 2));
    res.json(transformed);

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

const kafka = new Kafka({
  clientId: "alert-pipeline-" + Date.now(),
  brokers: [process.env.KAFKA_BOOTSTRAP_SERVER_URL],
});
const consumer = kafka.consumer({ groupId: process.env.KAFKA_CONSUMER_GROUP });
const producer = kafka.producer();

const run = async () => {
  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({ topic: process.env.KAFKA_CONSUMER_TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const rawData = JSON.parse(message.value.toString());
        const transformedData = transformData(rawData);
        console.log("Transformed message:", transformedData);

        await producer.send({
          topic: process.env.KAFKA_PRODUCER_TOPIC,
          messages: [{ value: JSON.stringify(transformedData) }],
        });

        console.log("Published message to producer topic.");
      } catch (err) {
        console.log("Error processing Kafka message:", err);
      }
    },
  });
};

app.listen(PORT, () => {
  console.log(`Ingress listening on port ${PORT}`);
});

run().catch(err => console.error("Run error:", err));

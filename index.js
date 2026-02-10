require("dotenv").config();

const express = require("express");
const { Kafka } = require("kafkajs");

const KAFKA_BROKER = process.env.KAFKA_BROKER;
const INPUT_TOPIC = process.env.INPUT_TOPIC;
const PORT = Number(process.env.PORT || 3000);

if (!KAFKA_BROKER || !INPUT_TOPIC) {
  throw new Error(
    "Missing required environment variables: KAFKA_BROKER, INPUT_TOPIC"
  );
}

// --- Kafka client ---
const kafka = new Kafka({
  clientId: "kafka-sse-service",
  brokers: [KAFKA_BROKER],
});

const consumer = kafka.consumer({ groupId: "kafka-sse-group" });

// --- SSE clients registry ---
/** @type {Set<import('express').Response>} */
const clients = new Set();

function writeSse(res, { event, id, data }) {
  if (id !== undefined) res.write(`id: ${id}\n`);
  if (event) res.write(`event: ${event}\n`);

  const payload = typeof data === "string" ? data : JSON.stringify(data);
  const lines = String(payload).split(/\r?\n/);
  for (const line of lines) {
    res.write(`data: ${line}\n`);
  }
  res.write("\n");
}

function broadcast(payload) {
  for (const res of clients) {
    try {
      writeSse(res, { event: "message", data: payload });
    } catch (_) {
      clients.delete(res);
    }
  }
}

async function startKafka() {
  await consumer.connect();
  await consumer.subscribe({ topic: INPUT_TOPIC, fromBeginning: false });

  console.log(`Kafka connected. Consuming topic: "${INPUT_TOPIC}"`);

  await consumer.run({
    eachMessage: async ({ message }) => {
      const raw = message.value ? message.value.toString() : "";

      try {
        const parsed = JSON.parse(raw);
        broadcast(parsed);
      } catch (_) {
        broadcast({ raw });
      }
    },
  });
}

function startHttp() {
  const app = express();

  app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // SSE endpoint
  app.get("/events", (req, res) => {
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    writeSse(res, { event: "connected", data: { ok: true } });

    clients.add(res);
    console.log(`SSE client connected. Total clients: ${clients.size}`);

    const keepAlive = setInterval(() => {
      try {
        res.write("No update yet\n\n");
      } catch (_) {
        // ignore
      }
    }, 10000);

    req.on("close", () => {
      clearInterval(keepAlive);
      clients.delete(res);
      console.log(`SSE client disconnected. Total clients: ${clients.size}`);
    });
  });

  const server = app.listen(PORT, () => {
    console.log(`SSE server listening on port ${PORT}`);
    console.log(`SSE endpoint: GET /events`);
  });

  return server;
}

async function start() {
  const server = startHttp();

  try {
    await startKafka();
  } catch (err) {
    console.error("Failed to start Kafka consumer:", err);
    server.close(() => process.exit(1));
  }
}

start();

async function shutdown(signal) {
  try {
    console.log(`Received ${signal}. Shutting down...`);
    for (const res of clients) {
      try {
        writeSse(res, { event: "shutdown", data: { ok: true } });
        res.end();
      } catch (_) {
        // ignore
      }
    }
    clients.clear();

    await consumer.disconnect();
  } catch (err) {
    console.error("Shutdown error:", err);
  } finally {
    process.exit(0);
  }
}

["SIGINT", "SIGTERM"].forEach((sig) => {
  process.on(sig, () => shutdown(sig));
});

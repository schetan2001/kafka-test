require("dotenv").config();

const express = require("express");
const { Kafka } = require("kafkajs");
const { FAULT_CODES_MAP, DOL_PARAMS_MAP, ECU_LIST } = require("./signalMappings");

const KAFKA_BROKER = process.env.KAFKA_BROKER;
const INPUT_TOPIC = process.env.INPUT_TOPIC;
const PORT = Number(process.env.PORT || 3000);
const AGGREGATION_WINDOW_MS = Number(process.env.AGGREGATION_WINDOW_MS || 1000);

// Event type filters
const FAULT_CODE_EVENT_TYPES = [6506];
const DOL_PARAM_EVENT_TYPES = [6500, 6501];

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
// Separate registries for fault codes and DOL parameters
/** @type {Map<import('express').Response, { systemId: string, ecuFilter: string[] | null }>} */
const faultCodeClients = new Map();
/** @type {Map<import('express').Response, { systemId: string, ecuFilter: string[] | null }>} */
const dolParamClients = new Map();

// --- Aggregation buffers ---
// Structure: { faultCodes: { ECU: { signalName: value } }, dolParams: { ECU: { signalName: value } }, meta, lastTimestamp }
/** @type {Map<string, { faultCodes: Object, dolParams: Object, meta: Object, lastTimestamp: string, flushTimer: NodeJS.Timeout | null }>} */
const aggregationBuffers = new Map();

// Initialize ECU-grouped buffer structure
function createEcuGroupedBuffer() {
  const buffer = {};
  for (const ecu of ECU_LIST) {
    buffer[ecu] = {};
  }
  return buffer;
}

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

// Accumulate signals into buffer (grouped by ECU)
function accumulateSignals(buffer, signalMap, dataItems) {
  for (const dataItem of dataItems) {
    const mapping = signalMap[dataItem.id];
    if (mapping && dataItem.value !== undefined) {
      const { signalName, ecu } = mapping;
      if (!buffer[ecu]) {
        buffer[ecu] = {};
      }
      buffer[ecu][signalName] = dataItem.value;
    }
  }
}

// Extract final signal values from buffer (remove empty ECU groups)
function extractSignals(buffer) {
  const result = {};
  for (const ecu of Object.keys(buffer)) {
    if (Object.keys(buffer[ecu]).length > 0) {
      result[ecu] = { ...buffer[ecu] };
    }
  }
  return result;
}

// Filter signals by ECU based on client's ecuFilter
function filterSignalsByEcu(signals, ecuFilter) {
  if (!ecuFilter || ecuFilter.length === 0) {
    return signals; // No filter, return all
  }
  
  const filtered = {};
  for (const ecu of ecuFilter) {
    if (signals[ecu]) {
      filtered[ecu] = signals[ecu];
    }
  }
  return filtered;
}

// Flush aggregated buffer to SSE clients
function flushBuffer(systemId) {
  const buffer = aggregationBuffers.get(systemId);
  if (!buffer) return;

  // Clear the timer reference
  if (buffer.flushTimer) {
    clearTimeout(buffer.flushTimer);
    buffer.flushTimer = null;
  }

  // Send fault codes if any
  const faultCodeSignals = extractSignals(buffer.faultCodes);
  if (Object.keys(faultCodeSignals).length > 0) {
    for (const [res, client] of faultCodeClients.entries()) {
      if (client.systemId !== systemId) continue;
      
      // Filter by ECU if client specified ecuFilter
      const filteredSignals = filterSignalsByEcu(faultCodeSignals, client.ecuFilter);
      if (Object.keys(filteredSignals).length === 0) continue;
      
      const faultCodePayload = {
        meta: buffer.meta,
        timestamp: buffer.lastTimestamp,
        signals: filteredSignals,
      };
      
      try {
        writeSse(res, { event: "message", data: faultCodePayload });
      } catch (_) {
        faultCodeClients.delete(res);
      }
    }
  }

  // Send DOL parameters if any
  const dolParamSignals = extractSignals(buffer.dolParams);
  if (Object.keys(dolParamSignals).length > 0) {
    for (const [res, client] of dolParamClients.entries()) {
      if (client.systemId !== systemId) continue;
      
      // Filter by ECU if client specified ecuFilter
      const filteredSignals = filterSignalsByEcu(dolParamSignals, client.ecuFilter);
      if (Object.keys(filteredSignals).length === 0) continue;
      
      const dolParamPayload = {
        meta: buffer.meta,
        timestamp: buffer.lastTimestamp,
        signals: filteredSignals,
      };
      
      try {
        writeSse(res, { event: "message", data: dolParamPayload });
      } catch (_) {
        dolParamClients.delete(res);
      }
    }
  }

  // Clear the buffer after flushing
  aggregationBuffers.delete(systemId);
}

function broadcast(payload) {
  const systemId = payload?.meta?.system_id;
  if (!systemId) return;

  const telemetryEntry = payload?.telemetry?.[0];
  if (!telemetryEntry?.data) return;

  const eventType = telemetryEntry.event_type;

  // Check if this event_type is relevant
  const isFaultCodeEvent = FAULT_CODE_EVENT_TYPES.includes(eventType);
  const isDolParamEvent = DOL_PARAM_EVENT_TYPES.includes(eventType);

  // Ignore if not a relevant event_type
  if (!isFaultCodeEvent && !isDolParamEvent) return;

  // Get or create buffer for this systemId
  let buffer = aggregationBuffers.get(systemId);
  if (!buffer) {
    buffer = {
      faultCodes: createEcuGroupedBuffer(),
      dolParams: createEcuGroupedBuffer(),
      meta: {
        system_id: payload.meta?.system_id,
        device_id: payload.meta?.device_id,
        vin: payload.meta?.vin,
        trip_id: payload.meta?.trip_id,
        model_code: payload.meta?.model_code,
      },
      lastTimestamp: telemetryEntry.time,
      flushTimer: null,
    };
    aggregationBuffers.set(systemId, buffer);
  }

  // Update timestamp to latest
  buffer.lastTimestamp = telemetryEntry.time;

  // Accumulate signals based on event_type
  if (isFaultCodeEvent) {
    accumulateSignals(buffer.faultCodes, FAULT_CODES_MAP, telemetryEntry.data);
  }
  if (isDolParamEvent) {
    accumulateSignals(buffer.dolParams, DOL_PARAMS_MAP, telemetryEntry.data);
  }

  // Reset/start the flush timer
  if (buffer.flushTimer) {
    clearTimeout(buffer.flushTimer);
  }
  buffer.flushTimer = setTimeout(() => flushBuffer(systemId), AGGREGATION_WINDOW_MS);
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
        // Ignore non-JSON messages since they cannot be filtered by systemId
      }
    },
  });
}

function setupSseEndpoint(app, path, clientsMap, endpointName) {
  app.get(path, (req, res) => {
    const systemId = String(
      req.query.systemId ?? req.query.system_id ?? req.query.systemID ?? ""
    ).trim();

    if (!systemId) {
      res.status(400).json({ error: "Missing required query param: systemId" });
      return;
    }

    // Parse ECU filter (optional, comma-separated list)
    const ecuParam = String(req.query.ecu ?? "").trim().toUpperCase();
    const ecuFilter = ecuParam ? ecuParam.split(",").map(e => e.trim()).filter(e => ECU_LIST.includes(e)) : null;

    // Validate ECU filter if provided
    if (ecuParam && (!ecuFilter || ecuFilter.length === 0)) {
      res.status(400).json({ 
        error: "Invalid ECU filter. Valid ECUs: " + ECU_LIST.join(", "),
        validEcus: ECU_LIST
      });
      return;
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    writeSse(res, { 
      event: "connected", 
      data: { 
        ok: true, 
        systemId, 
        endpoint: endpointName,
        ecuFilter: ecuFilter || "all"
      } 
    });

    clientsMap.set(res, { systemId, ecuFilter });
    const filterDesc = ecuFilter ? `ecuFilter=${ecuFilter.join(",")}` : "ecuFilter=all";
    console.log(
      `SSE client connected to ${endpointName} (systemId=${systemId}, ${filterDesc}). Total ${endpointName} clients: ${clientsMap.size}`
    );

    const keepAlive = setInterval(() => {
      try {
        res.write(": No update yet\n\n");
      } catch (_) {
        // ignore
      }
    }, 10000);

    req.on("close", () => {
      clearInterval(keepAlive);
      clientsMap.delete(res);
      console.log(`SSE client disconnected from ${endpointName}. Total ${endpointName} clients: ${clientsMap.size}`);
    });
  });
}

function startHttp() {
  const app = express();

  app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // SSE endpoint for Fault Codes
  setupSseEndpoint(app, "/events/fault-codes", faultCodeClients, "fault-codes");

  // SSE endpoint for DOL Parameters
  setupSseEndpoint(app, "/events/dol-parameters", dolParamClients, "dol-parameters");

  const server = app.listen(PORT, () => {
    console.log(`SSE server listening on port ${PORT}`);
    console.log(`Aggregation window: ${AGGREGATION_WINDOW_MS}ms`);
    console.log(`Fault Codes: event_types ${FAULT_CODE_EVENT_TYPES.join(", ")}`);
    console.log(`DOL Parameters: event_types ${DOL_PARAM_EVENT_TYPES.join(", ")}`);
    console.log(`Available ECUs for filtering: ${ECU_LIST.join(", ")}`);
    console.log(`Fault Codes SSE endpoint: GET /events/fault-codes?systemId=<id>&ecu=<optional>`);
    console.log(`DOL Parameters SSE endpoint: GET /events/dol-parameters?systemId=<id>&ecu=<optional>`);
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

    // Flush all pending buffers
    for (const [systemId, buffer] of aggregationBuffers.entries()) {
      if (buffer.flushTimer) {
        clearTimeout(buffer.flushTimer);
      }
      flushBuffer(systemId);
    }
    aggregationBuffers.clear();
    
    // Close fault code clients
    for (const res of faultCodeClients.keys()) {
      try {
        writeSse(res, { event: "shutdown", data: { ok: true } });
        res.end();
      } catch (_) {
        // ignore
      }
    }
    faultCodeClients.clear();

    // Close DOL parameter clients
    for (const res of dolParamClients.keys()) {
      try {
        writeSse(res, { event: "shutdown", data: { ok: true } });
        res.end();
      } catch (_) {
        // ignore
      }
    }
    dolParamClients.clear();

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

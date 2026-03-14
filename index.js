require("dotenv").config();
const express = require("express");
const { Kafka } = require("kafkajs");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
app.use(express.json());
app.use(cors());

const KAFKA_BROKER = process.env.KAFKA_BROKER;
const INPUT_TOPIC = process.env.INPUT_TOPIC;
const PORT = process.env.PORT;
const KAFKA_GROUP_ID = process.env.KAFKA_GROUP_ID || "vehicle-tracking-sse-group";

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "c2c_telemetry_db",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

if (!KAFKA_BROKER || !INPUT_TOPIC) {
  console.error("Missing required environment variables: KAFKA_BROKER, INPUT_TOPIC");
  process.exit(1);
}

const latestTelemetryData = new Map();

const activeConnections = new Map();

const ALLOWED_EVENT_TYPES = [3101, 6500];

const extractValueById = (data, propertyId) => {
  const item = data?.find((d) => d.id === propertyId);
  return item ? String(Array.isArray(item.value) ? item.value[0] : item.value) : null;
};

// Fetch latest GPS coordinates from database
async function fetchLatestGPSFromDB(systemId) {
  try {
    const query = `
      SELECT element_id, value, time 
      FROM public.t_telemetry_curr_values 
      WHERE system_id = $1 
        AND element_id IN (559940097, 559940098) 
        AND event_type = 3101
    `;
    
    const result = await pool.query(query, [systemId]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const data = {};
    result.rows.forEach(row => {
      if (row.element_id === 559940097) {
        data.latitude = row.value;
        data.time = row.time; // Capture time from the row
      } else if (row.element_id === 559940098) {
        data.longitude = row.value;
        if (!data.time) data.time = row.time; // Capture time if not set
      }
    });
    
    // Only return if we have both lat and lng
    if (data.latitude && data.longitude) {
      return data;
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching GPS for ${systemId} from DB:`, error.message);
    return null;
  }
}

const getChargingStatus = (data) => {
  const modeLvl1 = extractValueById(data, 557875295);
  if (modeLvl1 === "5") {
    const modeLvl2 = extractValueById(data, 557875296);
    if (modeLvl2 === "15") return "Fast Charging";
    if (modeLvl2 === "16") return "Slow Charging";
  }
  return "Not Charging";
};

const getVehicleStatus = (data) => {
  const modeLvl1 = extractValueById(data, 557875295);
  if (modeLvl1 === "4") return "Riding";

  const modeLvl3 = extractValueById(data, 557875297);
  if (["1", "4", "6"].includes(modeLvl3)) return "Locked";

  const modeLvl2 = extractValueById(data, 557875296);
  if (modeLvl2 === "12") return "Parked";

  return "Unlocked";
};

// Fetch and merge initial data for all systemIds
async function fetchInitialData(systemIds) {
  const initialData = {};
  const fetchPromises = systemIds.map(async (systemId) => {
    const cachedData = latestTelemetryData.get(systemId) || {};
    const dbData = await fetchLatestGPSFromDB(systemId);
    
    // Merge cached data with fresh DB data
    initialData[systemId] = {
      ...cachedData,
      systemId,
      ...(dbData && {
        latitude: dbData.latitude,
        longitude: dbData.longitude
      })
    };
  });

  await Promise.all(fetchPromises);
  return initialData;
}

const transformTrackingData = (payload) => {
  const systemId = payload?.meta?.system_id;
  if (!systemId) return null;

  const telemetryEntry = payload?.telemetry?.[0];
  if (!telemetryEntry?.data) return null;

  const eventType = telemetryEntry.event_type;

  if (!ALLOWED_EVENT_TYPES.includes(eventType)) return null;

  const data = telemetryEntry.data;

  const existingData = latestTelemetryData.get(systemId) || {};

  const updatedData = {
    systemId,
    timestamp: telemetryEntry.time,
    // GPS data from event_type 3101
    latitude: extractValueById(data, 559940097) || existingData.latitude,
    longitude: extractValueById(data, 559940098) || existingData.longitude,
    latitudeDirection: extractValueById(data, 554745874) || existingData.latitudeDirection,
    longitudeDirection: extractValueById(data, 554745875) || existingData.longitudeDirection,
    gpsFixValue: extractValueById(data, 559988762) || existingData.gpsFixValue,
    gpsSignalStrength: extractValueById(data, 554745871) || existingData.gpsSignalStrength,
    gpsStatus: extractValueById(data, 554745870) || existingData.gpsStatus,
    gpsSpeed: extractValueById(data, 559942149) || existingData.gpsSpeed,
    // Vehicle data from event_type 6500
    frontPressureLvl: extractValueById(data, 826314763) || existingData.frontPressureLvl,
    rearPressureLvl: extractValueById(data, 826314764) || existingData.rearPressureLvl,
    ignitionStatus: extractValueById(data, 557875730) || existingData.ignitionStatus,
    liveOdo: extractValueById(data, 559972924) || existingData.liveOdo,
    batterySoc: extractValueById(data, 557876173) || existingData.batterySoc,
    rideMode: extractValueById(data, 557876215) || existingData.rideMode,
    // Vehicle mode levels (used for status calculation)
    vehicleModeLvl1: extractValueById(data, 557875295) || existingData.vehicleModeLvl1,
    vehicleModeLvl2: extractValueById(data, 557875296) || existingData.vehicleModeLvl2,
    vehicleModeLvl3: extractValueById(data, 557875297) || existingData.vehicleModeLvl3,
    // Derived statuses
    chargingStatus: eventType === 6500 ? getChargingStatus(data) : existingData.chargingStatus,
    vehicleStatus: eventType === 6500 ? getVehicleStatus(data) : existingData.vehicleStatus,
  };

  return updatedData;
};

// Kafka Consumer Setup
const kafka = new Kafka({
  clientId: "vehicle-tracking-sse-service",
  brokers: [KAFKA_BROKER],
});

const consumer = kafka.consumer({ groupId: KAFKA_GROUP_ID });

async function startKafkaConsumer() {
  try {
    await consumer.connect();
    console.log("Kafka consumer connected");

    await consumer.subscribe({ topic: INPUT_TOPIC, fromBeginning: false });
    console.log(`Subscribed to topic: ${INPUT_TOPIC}`);

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const payload = JSON.parse(message.value.toString());
          const trackingData = transformTrackingData(payload);

          if (trackingData) {
            const { systemId } = trackingData;

            latestTelemetryData.set(systemId, trackingData);

            activeConnections.forEach((connection) => {
              if (connection.systemIds.includes(systemId)) {
                const dataForClient = {};
                connection.systemIds.forEach((id) => {
                  const data = latestTelemetryData.get(id);
                  if (data) {
                    dataForClient[id] = data;
                  }
                });

                connection.res.write(`data: ${JSON.stringify(dataForClient)}\n\n`);
              }
            });

            console.log(`Updated and broadcast telemetry for systemId: ${systemId}`);
          }
        } catch (error) {
          console.error("Error processing Kafka message:", error);
        }
      },
    });
  } catch (error) {
    console.error("Failed to start Kafka consumer:", error.message);
  }
}

// SSE Endpoint
app.get("/stream", async (req, res) => {
  const systemIdsParam = req.query.systemIds;

  if (!systemIdsParam) {
    return res.status(400).json({
      error: "Bad Request",
      message: "systemIds query parameter is required (comma-separated)",
    });
  }

  const systemIds = systemIdsParam.split(",").map((id) => id.trim()).filter(Boolean);

  if (systemIds.length === 0) {
    return res.status(400).json({
      error: "Bad Request",
      message: "systemIds must contain at least one valid system ID",
    });
  }

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const connectionId = `${Date.now()}-${Math.random()}`;

  activeConnections.set(connectionId, {
    res,
    systemIds,
    startTime: Date.now(),
  });

  console.log(`New SSE connection: ${connectionId} for systemIds: ${systemIds.join(", ")}`);

  // Fetch initial GPS data from DB for all systemIds (lat/long/time)
  const gpsData = {};
  const fetchPromises = systemIds.map(async (systemId) => {
    const dbData = await fetchLatestGPSFromDB(systemId);
    if (dbData) {
      gpsData[systemId] = {
        latitude: dbData.latitude,
        longitude: dbData.longitude,
        time: dbData.time
      };
    }
  });

  await Promise.all(fetchPromises);

  // Send connection status with GPS data
  const connectionMessage = {
    status: "connected",
    data: gpsData
  };

  res.write(`data: ${JSON.stringify(connectionMessage)}\n\n`);

  req.on("close", () => {
    activeConnections.delete(connectionId);
    console.log(`SSE connection closed: ${connectionId}`);
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    activeConnections: activeConnections.size,
    trackedVehicles: latestTelemetryData.size,
  });
});

app.listen(PORT, async () => {
  console.log(`🚀 Vehicle Tracking SSE Server running on port ${PORT}`);
  console.log(`📡 SSE endpoint: GET http://localhost:${PORT}/stream?systemIds=id1,id2`);
  await startKafkaConsumer();
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down gracefully...");
  await consumer.disconnect();
  process.exit(0);
});

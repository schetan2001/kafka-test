require("dotenv").config();
const { Kafka } = require("kafkajs");
const axios = require("axios");
const express = require("express");
const { MongoClient } = require("mongodb");
const { Pool } = require("pg");

// --- Location Fetch and Reverse Geocode ---
const LOCATION_API_URL =
  process.env.TELEMETRY_API_URL ||
  "https://cbp-in-uat.royalenfield.com/telemetry-curr/current-value/";
const LOCATION_API_HEADERS = {
  accept: "*/*",
  "x-requestor": "test",
  "api-key": process.env.TELEMETRY_API_KEY,
};

async function fetchLatLng(systemId) {
  try {
    const url = `${LOCATION_API_URL}${systemId}`;
    const resp = await axios.get(url, { headers: LOCATION_API_HEADERS });
    const signals = resp.data?.responseData?.signals || [];
    const lat = signals.find((s) => s.name === "AL_LATITUDE")?.value;
    const lng = signals.find((s) => s.name === "AL_LONGITUDE")?.value;
    if (lat && lng) return { lat, lng };
    return null;
  } catch (err) {
    console.error("Error fetching lat/lng:", err.message);
    return null;
  }
}

async function reverseGeocode(lat, lng) {
  if (!lat || !lng) return null;
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      console.warn("Google Maps API key not set.");
      return null;
    }
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
    const resp = await axios.get(url);
    const data = resp.data;
    if (data.results && data.results.length > 0) {
      return data.results[0].formatted_address || null;
    }
    return null;
  } catch (err) {
    console.error("Reverse geocoding failed:", err.message);
    return null;
  }
}

// --- PostgreSQL Setup ---
const pgPool = new Pool({
  host: process.env.PG_HOST || "localhost",
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE || "c2c_vehicle_diagnostic_db",
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: {
    rejectUnauthorized: false
  }
});

// --- MongoDB Setup ---
const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB = process.env.MONGO_DB || "re-fulfilment-layer";
const MONGO_COLLECTION =
  process.env.MONGO_COLLECTION || "common_provision_detail";
let mongoClient = null;
let mongoDb = null;

async function connectMongo() {
  if (mongoDb) return mongoDb;
  try {
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    mongoDb = mongoClient.db(MONGO_DB);
    console.log("Connected to MongoDB");
    return mongoDb;
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    throw err;
  }
}

async function getVinForSystemId(systemId) {
  try {
    const db = await connectMongo();
    const doc = await db
      .collection(MONGO_COLLECTION)
      .findOne({ _id: systemId });
    if (doc && doc.vin) {
      return doc.vin;
    }
    return systemId; // fallback
  } catch (err) {
    console.error("Error fetching VIN from MongoDB:", err.message);
    return systemId;
  }
}

// --- Configuration ---
const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";
const KAFKA_TOPIC = process.env.KAFKA_TOPIC;
const SERVER_PORT = process.env.SERVER_PORT || 4000;
const TICKET_API_URL =
  "https://sdpondemand.manageengine.in/app/sandbox_60023490885_100725_iax/api/v3/requests";

const TOKEN_API_URL =
  "https://accounts.zoho.in/oauth/v2/token?refresh_token=1000.de9f6a55b1bc15f3a7054cae27cbe897.efd51e07c78d8875ec84797452d45a26&grant_type=refresh_token&client_id=1000.JARQGYYRTK7II3HNYA24RJRTA3JYUU&client_secret=84fdafbd326346583d03075e0047368b594f8240da&redirect_uri=https%3A%2F%2Fsdpondemand.manageengine.in%2Fhome%2F&scope=SDPOnDemand.requests.CREATE,SDPOnDemand.requests.UPDATE";

const TOKEN_HEADERS = {
  Cookie:
    "_zcsr_tmp=dd6b6ad5-2b4d-428a-9761-f782ffa72c05; iamcsr=dd6b6ad5-2b4d-428a-9761-f782ffa72c05; zalb_6e73717622=dea4bb29906843a6fbdf3bd5c0e43d1d",
};

// --- In-Memory Cache for Active Tickets ---
// The map stores { ticketId: string, createdAt: number }
const activeTicketsCache = new Map();

let accessToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }
  const response = await axios.post(
    TOKEN_API_URL,
    {},
    { headers: TOKEN_HEADERS },
  );
  accessToken = response.data.access_token;
  tokenExpiry = Date.now() + 3600 * 1000; // 1 hour
  return accessToken;
}

const SUPPORT_PORTAL_BASE_URL =
  process.env.SUPPORT_PORTAL_BASE_URL ||
  "https://tap-sit.royalenfield.com/monitoring/remote-diagnostics";

function buildSupportPortalLink(systemId, vin) {
  const u = new URL(SUPPORT_PORTAL_BASE_URL);
  // Only add VIN if it is not missing and not equal to systemId (fallback)
  if (vin && vin !== systemId) {
    u.searchParams.set("vin", vin);
  }
  if (systemId) {
    u.searchParams.set("systemId", systemId);
  }
  return u.toString();
}

async function handleKafkaMessage(payload) {
  const {
    systemId,
    dtcId,
    dtcCode,
    description: dtcDescription,
    status,
    eventTime,
    severity,
    clearedAt,
  } = payload;

  if (!systemId || !dtcId || !status) {
    console.warn(
      "Ignoring message with missing systemId, dtcId, or status:",
      payload,
    );
    return;
  }

  // Fetch VIN from MongoDB
  const vin = await getVinForSystemId(systemId);
  const portalLink = buildSupportPortalLink(systemId, vin);
  const displayId = `systemId: ${systemId}`;

  // Fetch location address (with fallback)
  let locationAddress =
    "W63G+4M5 MAIN BLOCK, 296, Rajiv Gandhi Salai, Elcot Sez, Sholinganallur, Chennai, Tamil Nadu 600119";
  try {
    const latlng = await fetchLatLng(systemId);
    if (latlng) {
      const addr = await reverseGeocode(latlng.lat, latlng.lng);
      if (addr) locationAddress = addr;
    }
  } catch (err) {
    // fallback to default address
    console.warn("Could not fetch dynamic address, using fallback.");
  }

  try {
    const token = await getAccessToken();
    const headers = {
      Accept: "application/vnd.manageengine.sdp.v3+json",
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const ticketKey = `${systemId}-${dtcId}`;
    const ticketExists = activeTicketsCache.has(ticketKey);
    const isCloseStatus = status.toUpperCase() === "CLOSED";
    const isOpenStatus = status.toUpperCase() === "OPEN";

    if (isCloseStatus && ticketExists) {
      // --- CLOSE ticket for this property ---
      const { ticketId } = activeTicketsCache.get(ticketKey);
      const updateUrl = `${TICKET_API_URL}/${ticketId}`;
      const timestampIST = new Date(clearedAt || Date.now()).toLocaleString(
        "en-IN",
        {
          timeZone: "Asia/Kolkata",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        },
      );
      const resolutionPayload = {
        request: {
          status: { name: "Resolved" },
          resolution: {
            content: `Fault cleared for DTC ID ${dtcId} at ${timestampIST} IST. Auto-closed.`,
          },
        },
      };
      const form = new URLSearchParams();
      form.append("input_data", JSON.stringify(resolutionPayload));
      try {
        await axios.put(updateUrl, form, { headers });
        console.log(
          `Resolved ticket ${ticketId} for ${displayId}, dtcId=${dtcId}`,
        );
        activeTicketsCache.delete(ticketKey);

        // Update PostgreSQL
        try {
          const updateQuery = `
            UPDATE ff_dtc_tickets 
            SET ticket_status = $1, resolved_time = $2 
            WHERE request_id = $3
          `;
          const resolvedTime = Date.now();
          await pgPool.query(updateQuery, ['RESOLVED', resolvedTime, ticketId]);
          console.log(`Updated ticket ${ticketId} status to Resolved in database`);
        } catch (dbErr) {
          console.error(`Failed to update ticket ${ticketId} in database:`, dbErr.message);
        }
      } catch (e) {
        console.error(
          `Failed to resolve ticket ${ticketId} for ${displayId}, dtcId=${dtcId}:`,
          e.response?.data || e.message,
        );
      }
      return; // End processing for this message
    }

    if (isOpenStatus && !ticketExists) {
      // --- CREATE a new ticket ---
      const timestampIST = new Date(eventTime).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });

      const subject = `Flying Flea- DTC: ${dtcCode} | Category: K | ${vin}`;

      const description =
        `Fault detected for <b>${vin}</b> at ${timestampIST} IST<br>` +
        `<b>VIN:</b> ${vin}<br>` +
        `<b>DTC Code:</b> ${dtcCode} - ${dtcDescription}<br>` +
        `<b>Severity:</b> ${severity}<br><br>` +
        `<b>Location Address:</b> ${locationAddress}<br><br>` +
        `<a href="${portalLink}">View in Vehicle Support Portal</a>`;

      const ticketJsonPayload = {
        request: {
          subject,
          group: { name: "FF GRID Support" },
          description,
          requester: { email_id: "itsmadmin@royalenfield.com" },
          udf_fields: {
            udf_char365: "4Y1S665848Z411439",
            udf_char371: "K",
            udf_char372: dtcCode,
          },
          template: { name: "FF GRID" },
        },
      };
      const form = new URLSearchParams();
      form.append("input_data", JSON.stringify(ticketJsonPayload));

      try {
        const resp = await axios.post(TICKET_API_URL, form, { headers });
        const newTicketId = resp.data.request.id;
        const displayIdFromResponse = resp.data.request.display_key?.value || displayId;
        
        console.log(
          `Created ticket ${newTicketId} for ${displayId}, dtcId=${dtcId}`,
        );
        activeTicketsCache.set(ticketKey, {
          ticketId: newTicketId,
          createdAt: Date.now(),
        });

        // Insert into PostgreSQL
        const createdTime = Date.now();
        console.log(createdTime);
        try {
          const insertQuery = `
            INSERT INTO ff_dtc_tickets (
              request_id, display_id, system_id, vin, dtc_id, dtc_code, 
              dtc_description, ecu_type, severity, ticket_status, 
              created_time, location_address
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `;
          await pgPool.query(insertQuery, [
            newTicketId,
            displayIdFromResponse,
            systemId,
            vin,
            dtcId,
            dtcCode,
            dtcDescription,
            'K', // ecu_type from udf_char371
            severity,
            'OPEN',
            createdTime,
            locationAddress
          ]);
          console.log(`Stored ticket ${newTicketId} in database`);
        } catch (dbErr) {
          console.error(`Failed to insert ticket ${newTicketId} into database:`, dbErr.message);
        }
      } catch (e) {
        console.error(
          `Failed to create ticket for ${displayId}, dtcId=${dtcId}:`,
          e.response?.data || e.message,
        );
      }
    }
    // else: no state change (e.g., OPEN status for an already open ticket, or CLOSE for a non-existent one)
  } catch (err) {
    console.error("Ticket processing error:", err.message);
  }
}

// Kafka consumer setup
const kafka = new Kafka({
  clientId: "me-ticket-connector",
  brokers: [KAFKA_BROKER],
});

const consumer = kafka.consumer({ groupId: "me-ticket-connector-group" });

async function startKafkaConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const payload = JSON.parse(message.value.toString());
        await handleKafkaMessage(payload);
      } catch (err) {
        console.error("Invalid Kafka message:", err.message);
      }
    },
  });
}

// Optional: REST API health check
const app = express();
app.get("/", (req, res) => res.send("ME Ticket Connector running"));

app.listen(SERVER_PORT, () => {
  console.log(`REST API listening on port ${SERVER_PORT}`);
  startKafkaConsumer().then(() => {
    console.log(`Kafka consumer listening on topic ${KAFKA_TOPIC}`);
  });
});

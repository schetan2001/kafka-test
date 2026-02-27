require("dotenv").config();
const { Kafka } = require("kafkajs");
const axios = require("axios");
const express = require("express");
const { MongoClient } = require("mongodb");
// --- MongoDB Setup ---
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://re-ff-DR:5UypPxl779QGmsCY@re-enterprise-mongo-uat.mfy7m.mongodb.net/";
const MONGO_DB = process.env.MONGO_DB || "re_enterprise";
const MONGO_COLLECTION = process.env.MONGO_COLLECTION || "common_provision_details";
let mongoClient;

async function getVinForSystemId(systemId) {
  try {
    if (!mongoClient) {
      mongoClient = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
      await mongoClient.connect();
    }
    const db = mongoClient.db(MONGO_DB);
    const collection = db.collection(MONGO_COLLECTION);
    console.log(`[VIN Lookup] Querying for systemId: ${systemId} in DB: ${MONGO_DB}, Collection: ${MONGO_COLLECTION}`);
    const doc = await collection.findOne({ _id: systemId });
    if (doc) {
      console.log(`[VIN Lookup] Found document for systemId ${systemId}:`, doc);
    } else {
      console.warn(`[VIN Lookup] No document found for systemId ${systemId}`);
    }
    return doc?.vin || null;
  } catch (err) {
    console.error(`MongoDB connection or query error for systemId ${systemId}:`, err.message);
    return null;
  }
}

// --- Configuration ---
const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";
const KAFKA_TOPIC = process.env.KAFKA_TOPIC;
const SERVER_PORT = process.env.SERVER_PORT || 4000;
const TICKET_API_URL = "https://sdpondemand.manageengine.in/app/sandbox_60023490885_100725_iax/api/v3/requests";

const TELEMETRY_API_URL = process.env.TELEMETRY_API_URL || "https://cbp-in-uat.royalenfield.com/telemetry-curr/current-value";
const TELEMETRY_API_KEY = process.env.TELEMETRY_API_KEY || "dgKlKWwxYban74FXtKUEqQkWJG625c1SR7WP9rnc3b0";
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "AIzaSyCkfcEBcQQU6rNv2O2Rp-2jpc8sXuBArTc";
const GOOGLE_REVERSE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

const TOKEN_API_URL = "https://accounts.zoho.in/oauth/v2/token?refresh_token=1000.de9f6a55b1bc15f3a7054cae27cbe897.efd51e07c78d8875ec84797452d45a26&grant_type=refresh_token&client_id=1000.JARQGYYRTK7II3HNYA24RJRTA3JYUU&client_secret=84fdafbd326346583d03075e0047368b594f8240da&redirect_uri=https%3A%2F%2Fsdpondemand.manageengine.in%2Fhome%2F&scope=SDPOnDemand.requests.CREATE,SDPOnDemand.requests.UPDATE";

const TOKEN_HEADERS = {
  Cookie: "_zcsr_tmp=dd6b6ad5-2b4d-428a-9761-f782ffa72c05; iamcsr=dd6b6ad5-2b4d-428a-9761-f782ffa72c05; zalb_6e73717622=dea4bb29906843a6fbdf3bd5c0e43d1d"
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
  const response = await axios.post(TOKEN_API_URL, {}, { headers: TOKEN_HEADERS });
  accessToken = response.data.access_token;
  tokenExpiry = Date.now() + 3600 * 1000; // 1 hour
  return accessToken;
}

const SUPPORT_PORTAL_BASE_URL =
  process.env.SUPPORT_PORTAL_BASE_URL || "https://wingman-portal-preprod.royalenfield.com/monitoring/remote-diagnostics";

function buildSupportPortalLink(vin) {
  if (!vin) return SUPPORT_PORTAL_BASE_URL;
  const u = new URL(SUPPORT_PORTAL_BASE_URL);
  u.searchParams.set("vin", vin);
  return u.toString();
}

async function getVehicleLocation(systemId) {
  try {
    const response = await axios.get(`${TELEMETRY_API_URL}/${systemId}`, {
      headers: {
        'accept': '*/*',
        'x-requestor': 'test',
        'api-key': TELEMETRY_API_KEY
      }
    });

    const signals = response.data?.responseData?.signals;
    if (!signals) {
      console.warn(`No signals data found for systemId: ${systemId}`);
      return null;
    }

    const latSignal = signals.find(s => s.name === "AL_LATITUDE" && s.eventType === 3101);
    const lonSignal = signals.find(s => s.name === "AL_LONGITUDE" && s.eventType === 3101);

    if (latSignal && lonSignal && latSignal.value && lonSignal.value) {
      const lat = latSignal.value;
      const lon = lonSignal.value;
      
      const geoResponse = await axios.get(GOOGLE_REVERSE_GEOCODE_URL, {
        params: {
          latlng: `${lat},${lon}`,
          key: GOOGLE_MAPS_API_KEY
        }
      });

      if (geoResponse.data.results && geoResponse.data.results.length > 0) {
        return geoResponse.data.results[0].formatted_address || "Address not found.";
      } else {
        console.warn(`Google Geocoding: Address not found for ${lat},${lon}. Status: ${geoResponse.data.status}`);
        return "Address not found.";
      }
    }
    return null;
  } catch (error) {
    console.error(`Failed to get vehicle location for ${systemId}:`, error.message);
    return null;
  }
}


async function handleKafkaMessage(payload) {
  const { systemId, dtcId, dtcCode, description: dtcDescription, status, eventTime, severity } = payload;

  if (!systemId || !dtcId || !status) {
    console.warn("Ignoring message with missing systemId, dtcId, or status:", payload);
    return;
  }

  // --- Get VIN for systemId ---
  const vin = await getVinForSystemId(systemId);
  if (!vin) {
    console.warn(`No VIN found for systemId: ${systemId}`);
    return;
  }

  const portalLink = buildSupportPortalLink(vin);
  const displayId = `VIN: ${vin}`;

  try {
    const token = await getAccessToken();
    const headers = {
      'Accept': 'application/vnd.manageengine.sdp.v3+json',
      'Authorization': `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    const ticketKey = `${vin}-${dtcId}`;
    const ticketExists = activeTicketsCache.has(ticketKey);
    const isCloseStatus = status.toUpperCase() === 'CLOSE';
    const isOpenStatus = status.toUpperCase() === 'OPEN';

    if (isCloseStatus && ticketExists) {
      // --- CLOSE ticket for this property ---
      const { ticketId } = activeTicketsCache.get(ticketKey);
      const updateUrl = `${TICKET_API_URL}/${ticketId}`;
      const resolutionPayload = {
        request: {
          status: { name: "Resolved" },
          resolution: { content: `Fault cleared for DTC ID ${dtcId}. Auto-closed.` }
        }
      };
      const form = new URLSearchParams();
      form.append('input_data', JSON.stringify(resolutionPayload));
      try {
        await axios.put(updateUrl, form, { headers });
        console.log(`Resolved ticket ${ticketId} for ${displayId}, dtcId=${dtcId}`);
        activeTicketsCache.delete(ticketKey);
      } catch (e) {
        console.error(`Failed to resolve ticket ${ticketId} for ${displayId}, dtcId=${dtcId}:`, e.response?.data || e.message);
      }
      return; // End processing for this message
    }

    if (isOpenStatus && !ticketExists) {
      // --- CREATE a new ticket ---
      const timestampIST = new Date(eventTime).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
      });

      const subject = `Flying Flea- DTC: ${dtcCode} | Category: K | ${vin}`;

      const locationAddress = await getVehicleLocation(systemId);
      const locationHtml = locationAddress 
        ? `<b>Location Address:</b> ${locationAddress}<br><br>`
        : `<b>Location Address:</b> W63G+4M5 MAIN BLOCK, 296, Rajiv Gandhi Salai, Elcot Sez, Sholinganallur, Chennai, Tamil Nadu 600119<br><br>`;

      const description =
        `Fault detected for <b>${displayId}</b> at ${timestampIST} IST<br>` +
        `<b>DTC Code:</b> ${dtcCode}<br>` +
        `<b>DTC Description:</b> ${dtcDescription}<br>` +
        `<b>Severity:</b> ${severity}<br><br>` +
        locationHtml +
        `<a href="${portalLink}">View in Vehicle Support Portal</a>`;

      const ticketJsonPayload = {
        request: {
          subject,
          group: { name: "FF GRID Support" },
          description,
          requester: { email_id: "itsmadmin@royalenfield.com" },
          template: { name: "FF GRID" }
        }
      };
      const form = new URLSearchParams();
      form.append('input_data', JSON.stringify(ticketJsonPayload));

      try {
        const resp = await axios.post(TICKET_API_URL, form, { headers });
        const newTicketId = resp.data.request.id;
        console.log(`Created ticket ${newTicketId} for ${displayId}, dtcId=${dtcId}`);
        activeTicketsCache.set(ticketKey, { ticketId: newTicketId, createdAt: Date.now() });
      } catch (e) {
        console.error(`Failed to create ticket for ${displayId}, dtcId=${dtcId}:`, e.response?.data || e.message);
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
  brokers: [KAFKA_BROKER]
});

const consumer = kafka.consumer({ groupId: "me-ticket-connector-group" });

async function startKafkaConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const payload = JSON.parse(message.value.toString());
        const eventType = payload?.telemetry?.[0]?.event_type;
        const allowedEventTypes = [6504, 6505, 6506];

        if (eventType && allowedEventTypes.includes(eventType)) {
          await handleKafkaMessage(payload);
        }
      } catch (err) {
        console.error("Invalid Kafka message:", err.message);
      }
    }
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
require("dotenv").config();
const { Kafka } = require("kafkajs");
const axios = require("axios");
const express = require("express");

// --- Configuration ---
const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";
const KAFKA_TOPIC = process.env.KAFKA_TOPIC;
const SERVER_PORT = process.env.SERVER_PORT || 4000;
const TICKET_API_URL = "https://sdpondemand.manageengine.in/app/sandbox_60023490885_100725_iax/api/v3/requests";

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
  process.env.SUPPORT_PORTAL_BASE_URL || "https://wingman-portal-preprod.royalenfield.com/telemetry-tracker";

function buildSupportPortalLink(systemId) {
  if (!systemId) return SUPPORT_PORTAL_BASE_URL;
  const u = new URL(SUPPORT_PORTAL_BASE_URL);
  u.searchParams.set("systemId", systemId);
  return u.toString();
}

async function handleKafkaMessage(payload) {
  const { systemId, dtcId, dtcCode, description: dtcDescription, status, eventTime, severity } = payload;

  if (!systemId || !dtcId || !status) {
    console.warn("Ignoring message with missing systemId, dtcId, or status:", payload);
    return;
  }

  const portalLink = buildSupportPortalLink(systemId);
  const displayId = `systemId: ${systemId}`;

  try {
    const token = await getAccessToken();
    const headers = {
      'Accept': 'application/vnd.manageengine.sdp.v3+json',
      'Authorization': `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    const ticketKey = `${systemId}-${dtcId}`;
    const ticketExists = activeTicketsCache.has(ticketKey);
    const isCloseStatus = status.toUpperCase() === 'CLOSED';
    const isOpenStatus = status.toUpperCase() === 'OPEN';

    if (isCloseStatus && ticketExists) {
      // --- CLOSE ticket for this property ---
      const { ticketId } = activeTicketsCache.get(ticketKey);
      const updateUrl = `${TICKET_API_URL}/${ticketId}`;
      const timestampIST = new Date(clearedAt || Date.now()).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
      });
      const resolutionPayload = {
        request: {
          status: { name: "Resolved" },
          resolution: { content: `Fault cleared for DTC ID ${dtcId} at ${timestampIST} IST. Auto-closed.` }
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

      const subject = `Flying Flea- DTC: ${dtcCode} | Category: K | ${systemId}`;

      const description =
        `Fault detected for <b>${displayId}</b> at ${timestampIST} IST<br>` +
        `<b>DTC ID:</b> ${dtcId}<br>` +
        `<b>DTC Code:</b> ${dtcCode} - ${dtcDescription}<br>` +
        `<b>Severity:</b> ${severity}<br><br>` +
        `<b>Location Address:</b> W63G+4M5 MAIN BLOCK, 296, Rajiv Gandhi Salai, Elcot Sez, Sholinganallur, Chennai, Tamil Nadu 600119<br><br>` +
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
        await handleKafkaMessage(payload);
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
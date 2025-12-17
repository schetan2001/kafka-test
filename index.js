require("dotenv").config();
const { Kafka } = require("kafkajs");
const axios = require("axios");
const express = require("express");

const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";
const KAFKA_TOPIC = process.env.KAFKA_TOPIC;
const SERVER_PORT = process.env.SERVER_PORT || 4000;

const TOKEN_API_URL = "https://accounts.zoho.in/oauth/v2/token?refresh_token=1000.de9f6a55b1bc15f3a7054cae27cbe897.efd51e07c78d8875ec84797452d45a26&grant_type=refresh_token&client_id=1000.JARQGYYRTK7II3HNYA24RJRTA3JYUU&client_secret=84fdafbd326346583d03075e0047368b594f8240da&redirect_uri=https%3A%2F%2Fsdpondemand.manageengine.in%2Fhome%2F&scope=SDPOnDemand.requests.CREATE";
const TOKEN_HEADERS = {
  Cookie: "_zcsr_tmp=dd6b6ad5-2b4d-428a-9761-f782ffa72c05; iamcsr=dd6b6ad5-2b4d-428a-9761-f782ffa72c05; zalb_6e73717622=dea4bb29906843a6fbdf3bd5c0e43d1d"
};
const TICKET_API_URL = "https://sdpondemand.manageengine.in/app/sandbox_60023490885_100725_iax/api/v3/requests";

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

/**
 * Processes a Kafka message and creates an individual ticket for each DTC
 * found in the dtcSnapshot array.
 * @param {object} payload - The raw JSON payload from the Kafka message.
 */
async function handleKafkaMessage(payload) {
  const { systemId, dtcSnapshot, timestamp } = payload;

  if (!systemId || !Array.isArray(dtcSnapshot) || dtcSnapshot.length === 0) {
    console.warn("Skipping message: Invalid format or empty dtcSnapshot.", payload);
    return;
  }

  try {
    const token = await getAccessToken();
    const headers = {
      'Accept': 'application/vnd.manageengine.sdp.v3+json',
      'Authorization': `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    };

    console.log(`Processing ${dtcSnapshot.length} DTC(s) for systemId: ${systemId}`);

    for (const dtc of dtcSnapshot) {
      const subject = `DTC Alert: ${dtc.dtcCode} for System ID ${systemId}`;

      const description = `A new diagnostic alert has been triggered for vehicle: <b>${systemId}</b>.<br><br>` +
                          `<b>Time of Alert:</b> ${new Date(timestamp).toUTCString()}<br>` +
                          `<b>DTC Code:</b> ${dtc.dtcCode}<br>` +
                          `<b>Description:</b> ${dtc.dtcDescription}<br>` +
                          `<b>Status:</b> ${dtc.status}<br>` +
                          `<b>Trigger Signal:</b> ${dtc.triggerSignal} (Value: ${dtc.triggerValue})<br>`;

      const ticketJsonPayload = {
        request: {
          subject: subject,
          description: description,
          requester: {
            email_id: "schetan@royalenfield.com"
          },
          template: {
            name: "Freshdesk"
          }
        }
      };

      const formData = new URLSearchParams();
      formData.append('input_data', JSON.stringify(ticketJsonPayload));

      try {
        const response = await axios.post(TICKET_API_URL, formData, { headers });
        console.log(`  - Successfully created ticket for ${dtc.dtcCode}. Ticket ID: ${response.data.request.id}`);
      } catch (ticketError) {
        console.error(`  - Failed to create ticket for ${dtc.dtcCode}:`, ticketError.response?.data || ticketError.message);
      }
    }
  } catch (err) {
    console.error("A critical error occurred during ticket processing:", err.message);
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
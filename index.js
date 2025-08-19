const { Kafka } = require('kafkajs');
const axios = require('axios');

// --- Environment Variables ---
const KAFKA_BROKERS = process.env.KAFKA_BROKERS.split(',');
const KAFKA_TOPIC = process.env.KAFKA_TOPIC;
const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;
const MANAGEENGINE_API_URL = process.env.MANAGEENGINE_API_URL;
const REQUESTER_EMAIL = process.env.REQUESTER_EMAIL;

// --- Global Variables ---
let accessToken = null;
let tokenExpiryTime = null;

// --- Kafka Setup ---
const kafka = new Kafka({
  clientId: 'manageengine-ticket-creator',
  brokers: KAFKA_BROKERS
});
const consumer = kafka.consumer({ groupId: 'manageengine-group' });

// --- Token Management ---
async function getAccessToken() {
  console.log("Attempting to get a new access token...");
  try {
    const response = await axios.post('https://accounts.zoho.in/oauth/v2/token', null, {
      params: {
        refresh_token: ZOHO_REFRESH_TOKEN,
        grant_type: 'refresh_token',
        client_id: ZOHO_CLIENT_ID,
        client_secret: ZOHO_CLIENT_SECRET
      }
    });

    accessToken = response.data.access_token;
    // Token is valid for 1 hour (3600 seconds)
    tokenExpiryTime = Date.now() + (response.data.expires_in * 1000) - 30000; // Refresh 30 seconds early
    console.log("Successfully obtained new access token.");
    return accessToken;

  } catch (error) {
    console.error('Failed to get access token:', error.response ? error.response.data : error.message);
    throw new Error('Access token acquisition failed.');
  }
}

async function getValidAccessToken() {
  // Check if token is null or expired
  if (!accessToken || Date.now() > tokenExpiryTime) {
    await getAccessToken();
  }
  return accessToken;
}

// --- Ticket Creation ---
async function createManageEngineTicket(messageValue) {
  try {
    const currentToken = await getValidAccessToken();
    
    // Parse the Kafka message to build the API body
    const kafkaData = JSON.parse(messageValue.toString());

    // Map your Kafka data to the ManageEngine request body
    // This is the core transformation logic
    const requestBody = {
      request: {
        subject: kafkaData.subject || "Ticket Created from Kafka",
        group: { name: "RE ITSM Support" },
        requester: { email_id: REQUESTER_EMAIL },
        udf_fields: {
          udf_char364: kafkaData.imei, // Example: mapping Kafka data to a UDF field
          udf_char365: kafkaData.partno,
          udf_char366: kafkaData.some_other_field,
          // Continue mapping other fields as needed
        },
        template: { name: "Freshdesk" },
        description: `Alert from Kafka. Details: ${JSON.stringify(kafkaData)}`
      }
    };

    const headers = {
      'Accept': 'application/vnd.manageengine.sdp.v3+json',
      'Authorization': `Zoho-oauthtoken ${currentToken}`,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(MANAGEENGINE_API_URL, requestBody, { headers });
    
    console.log(`Successfully created ticket: ${response.data.request.id}`);
    
  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.status, error.response.data);
    } else {
      console.error('An unexpected error occurred:', error.message);
    }
    // Depending on the error, you might want to re-try
    // For a 401 error, you might force a token refresh and re-try the request once
  }
}

// --- Main Function to Run the Consumer ---
async function run() {
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      console.log({
        topic,
        partition,
        offset: message.offset,
        value: message.value.toString(),
      });
      
      // Process the message and create a ticket
      await createManageEngineTicket(message.value);
    },
  });
}

run().catch(console.error);
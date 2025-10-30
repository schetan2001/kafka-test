require("dotenv").config();
const { Kafka } = require("kafkajs");
const axios = require("axios");

const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";
const SOURCE_TOPIC = process.env.SOURCE_TOPIC || "notification-topic";
const API_ENDPOINT = "https://mc3snfg-sfh7x8jmy5gw1rdk4zbq.rest.marketingcloudapis.com/messaging/v1/email/messages";
const AUTH_TOKEN = process.env.AUTH_TOKEN;

// Kafka setup
const kafka = new Kafka({
  clientId: "email-notification-processor",
  brokers: [KAFKA_BROKER],
});

const consumer = kafka.consumer({ groupId: "email-notification-group" });

const processMessage = async (message) => {
  try {
    const data = JSON.parse(message.value.toString());
    const { alertId, contact_number, email, name, date, time, reg_no } = data;

    let payload;
    if (alertId === "001") {
      payload = {
        definitionKey: "Worry_free_service",
        recipients: [{
          contactKey: contact_number,
          to: email,
          attributes: {
            SubscriberKey: contact_number,
            EmailAddress: email,
            CUSTOMERNAME: name,
            DEALERNAME: "RE INDIA",
            DATE: date,
            TIME: time
          }
        }]
      };
    } else if (alertId === "002") {
      payload = {
        definitionKey: "OTA _FOTA",
        recipients: [{
          contactKey: contact_number,
          to: email,
          attributes: {
            SubscriberKey: contact_number,
            EmailAddress: email,
            REGISTRATIONNUMBER: reg_no,
            Contact_Key: contact_number,
            CUSTOMERNAME: name
          }
        }]
      };
    }

    if (payload) {
      const response = await axios.post(API_ENDPOINT, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AUTH_TOKEN}`
        }
      });
      console.log(`Email sent successfully for alertId: ${alertId}`);
      return response.data;
    }
  } catch (error) {
    console.error('Error processing message:', error);
    throw error;
  }
};

const startKafkaProcessing = async () => {
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: SOURCE_TOPIC, fromBeginning: true });

    await consumer.run({
      eachMessage: async ({ message }) => {
        await processMessage(message);
      },
    });
  } catch (error) {
    console.error("Error in Kafka processing:", error);
  }
};

startKafkaProcessing().catch(console.error);
require("dotenv").config();
const { Kafka } = require("kafkajs");
const nodemailer = require("nodemailer");

// Kafka config
const kafka = new Kafka({
  clientId: "smtp-kafka-email",
  brokers: [process.env.KAFKA_BROKER],
});
const consumer = kafka.consumer({ groupId: "smtp-email-group" });

// SMTP transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.pepipost.com",
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE || "false" === "true",
  auth: {
    user: process.env.SMTP_USER || "royalenfield",
    pass: process.env.SMTP_PASS || "Am#9T@ks1b7",
  },
});

async function sendLowBatteryEmail(systemId) {
  const primaryTo = process.env.EMAIL_TO;
  const secondaryTo = process.env.EMAIL_TO_2;

  const recipients = secondaryTo ? [primaryTo, secondaryTo] : [primaryTo];

  const mailOptions = {
    from: process.env.EMAIL_FROM || "connectedassist@royalenfield.com",
    to: recipients.join(","), // send to one or both
    subject: `Low Battery Alert - ${systemId}`,
    text: `System ID ${systemId} has reported a LOW BATTERY state.`,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log(`Email sent: ${info.messageId} -> ${recipients.join(",")}`);
}

function isLowBatteryEvent(payload) {
  // event_type must contain "LOW BATTERY"
  const eventType = payload?.event_type || "";
  return eventType.toUpperCase().includes("LOW BATTERY");
}

function extractSystemId(payload) {
  return payload?.body?.meta?.system_id || "UNKNOWN";
}

async function start() {
  try {
    await transporter.verify();
    console.log("SMTP verified.");
  } catch (e) {
    console.error("SMTP verification failed:", e.message);
  }

  await consumer.connect();
  await consumer.subscribe({ topic: process.env.KAFKA_TOPIC, fromBeginning: false });

  console.log("Listening for Kafka messages...");

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const valueStr = message.value?.toString() || "{}";
        const payload = JSON.parse(valueStr);

        if (isLowBatteryEvent(payload)) {
          const systemId = extractSystemId(payload);
          console.log(`LOW BATTERY detected for system_id=${systemId}`);
          await sendLowBatteryEmail(systemId);
        }
      } catch (err) {
        console.error("Message processing error:", err.message);
      }
    },
  });
}

start().catch((err) => {
  console.error("Service failed to start:", err);
});
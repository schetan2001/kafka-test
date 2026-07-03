require("dotenv").config();
const app = require("./src/app");
const { client } = require("./src/config/mongo");

const PORT = process.env.PORT || 3011;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`vin-systemid-graphql-api running on port ${PORT}`)
);

async function shutdown(signal) {
  try {
    console.log(`[mongo] Closing MongoDB connection (${signal})...`);
    await client.close();
    console.log("[mongo] Connection closed.");
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const { MongoClient } = require("mongodb");

const client = new MongoClient(process.env.MONGO_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 10_000,
});

let db = null;

const getDb = async () => {
  if (!db) {
    await client.connect();
    db = client.db(process.env.DB_NAME || "re-fulfilment-layer");
    console.log("[mongo] Connected successfully.");
  }
  return db;
};

module.exports = { getDb, client };

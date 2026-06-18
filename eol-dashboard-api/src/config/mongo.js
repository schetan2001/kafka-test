const { MongoClient } = require("mongodb");

const client = new MongoClient(process.env.MONGO_URI);

let db = null;

const getDb = async () => {
  if (!db) {
    await client.connect();
    db = client.db(process.env.MONGO_DB_FULFILMENT || "re-fulfilment-layer");
    console.log("MongoDB connected");
  }
  return db;
};

module.exports = { getDb };

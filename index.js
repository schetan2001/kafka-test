require("dotenv").config();
const express = require("express");
const { MongoClient } = require("mongodb");

const PORT = Number(process.env.PORT || 3010);
const MONGO_URI = process.env.MONGO_URI;
const API_KEY = process.env.API_KEY; // <-- add

const DB_NAME = process.env.DB_NAME || "re-fulfilment-layer";
const COLLECTION_NAME = process.env.COLLECTION_NAME || "common_provision_detail";

if (!MONGO_URI) {
  throw new Error("Missing MONGO_URI in environment.");
}
if (!API_KEY) {
  throw new Error("Missing API_KEY in environment.");
}

const app = express();
app.use(express.json());

// Protect vin-map routes with API key
app.use("/vin-map", (req, res, next) => {
  const clientKey = req.headers["x-api-key"];
  if (!clientKey || clientKey !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

const client = new MongoClient(MONGO_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 10_000,
});

let collection;

async function initMongo() {
  if (collection) return collection;
  await client.connect();
  const db = client.db(DB_NAME);
  collection = db.collection(COLLECTION_NAME);
  return collection;
}

function escapeRegex(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ALLOWED_SORT_FIELDS = new Set(["_id", "vin"]);

function buildFilter(search) {
  const s = String(search ?? "").trim();
  if (!s) return {};

  const safe = escapeRegex(s);
  return {
    $or: [
      { vin: { $regex: safe, $options: "i" } },
      { _id: { $regex: safe, $options: "i" } },
    ],
  };
}

function normalizeSystemIds(input) {
  const arr = Array.isArray(input) ? input : String(input ?? "").split(",");
  return arr
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 500);
}

app.get("/vin-map", async (req, res) => {
  try {
    const col = await initMongo();

    const systemIdsParam = String(req.query.systemIds ?? "").trim();
    const search = req.query.search;

    // Mode A: Batch lookup by systemIds
    if (systemIdsParam) {
      const systemIds = normalizeSystemIds(systemIdsParam);
      if (systemIds.length === 0) {
        return res.status(400).json({ error: "systemIds is required (comma-separated)" });
      }

      const docs = await col
        .find({ _id: { $in: systemIds } }, { projection: { vin: 1 } })
        .toArray();

      const foundMap = new Map();
      for (const d of docs) {
        const id = d._id?.toString?.() ?? String(d._id);
        foundMap.set(id, { vin: d.vin ?? null });
      }

      // Ensure every requested id is present in map
      const map = {};
      for (const id of systemIds) {
        map[id] = foundMap.get(id) ?? { vin: null };
      }

      return res.json({
        countRequested: systemIds.length,
        countFound: docs.length,
        map,
      });
    }

    // Mode B: Search + sort + pagination
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 50, 1), 500);
    const pageNo = Math.max(Number(req.query.pageNo) || 1, 1);
    const skip = (pageNo - 1) * pageSize;

    const sortField = String(req.query.sort || "").trim();
    const direction = String(req.query.direction || "desc").toLowerCase();
    const sortDir = direction === "asc" ? 1 : -1;

    const filter = buildFilter(search);

    const sort =
      sortField && ALLOWED_SORT_FIELDS.has(sortField)
        ? { [sortField]: sortDir }
        : { _id: 1 };

    const totalRecords = await col.countDocuments(filter);

    const docs = await col
      .find(filter, { projection: { vin: 1 } })
      .sort(sort)
      .skip(skip)
      .limit(pageSize)
      .toArray();

    const map = {};
    for (const d of docs) {
      const id = d._id?.toString?.() ?? String(d._id);
      map[id] = { vin: d.vin ?? null };
    }

    return res.json({
      message: {
        totalRecords,
        pageNo,
        pageSize,
        offset: pageNo,
        limit: pageSize,
        sort: sortField && ALLOWED_SORT_FIELDS.has(sortField) ? sortField : "_id",
        direction: sortField && ALLOWED_SORT_FIELDS.has(sortField) ? direction : "asc",
        search: search ? String(search) : null,
      },
      map,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to build vin map", message: err.message });
  }
});

app.post("/vin-map", async (req, res) => {
  try {
    const col = await initMongo();
    const systemIds = normalizeSystemIds(req.body?.systemIds);

    if (systemIds.length === 0) {
      return res.status(400).json({ error: "systemIds is required (array in body)" });
    }

    const docs = await col
      .find({ _id: { $in: systemIds } }, { projection: { vin: 1 } })
      .toArray();

    const foundMap = new Map();
    for (const d of docs) {
      const id = d._id?.toString?.() ?? String(d._id);
      foundMap.set(id, { vin: d.vin ?? null });
    }

    const map = {};
    for (const id of systemIds) {
      map[id] = foundMap.get(id) ?? { vin: null };
    }

    return res.json({
      countRequested: systemIds.length,
      countFound: docs.length,
      map,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to build vin map", message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`mongo-provision-api listening on http://localhost:${PORT}`);
});

process.on("SIGINT", async () => {
  try {
    await client.close();
  } finally {
    process.exit(0);
  }
});
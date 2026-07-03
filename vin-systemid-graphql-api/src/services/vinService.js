const { getDb } = require("../config/mongo");

const MAX_VINS = 500;

const normalizeVins = (input) => {
  const seen = new Set();
  const result = [];
  for (const raw of input ?? []) {
    const vin = String(raw ?? "").trim();
    if (vin && !seen.has(vin)) {
      seen.add(vin);
      result.push(vin);
    }
  }
  return result.slice(0, MAX_VINS);
};

const getSystemIdsByVins = async (vins) => {
  const db = await getDb();
  const docs = await db
    .collection(process.env.COLLECTION_NAME || "provision_detail")
    .find({ vin: { $in: vins } }, { projection: { vin: 1 } })
    .toArray();

  const foundMap = new Map();
  for (const d of docs) {
    if (d.vin) {
      foundMap.set(d.vin, d._id?.toString?.() ?? String(d._id));
    }
  }

  return vins.map((vin) => ({ vin, systemId: foundMap.get(vin) ?? null }));
};

module.exports = { normalizeVins, getSystemIdsByVins };

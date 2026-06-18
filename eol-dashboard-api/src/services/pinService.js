const { getDb } = require("../config/mongo");

// A pin is considered active if activePinInfo exists and pin value is not null
const hasActivePin = (pin) => pin?.activePinInfo?.pin != null;

const computePinSyncStatus = (doc) => {
  if (!doc) return "FAILED";
  if (!doc.isTempPinViewed) return "FAILED";
  const activePinCount = (doc.pins || []).filter(hasActivePin).length;
  return activePinCount >= 7 ? "SUCCESS" : "FAILED";
};

const getPinSyncStatuses = async (systemIds) => {
  try {
    const db = await getDb();
    const docs = await db
      .collection("vehiclePin")
      .find(
        { _id: { $in: systemIds } },
        { projection: { isTempPinViewed: 1, pins: 1 } }
      )
      .toArray();

    const map = {};
    for (const doc of docs) {
      map[String(doc._id)] = computePinSyncStatus(doc);
    }
    // Any systemId with no document → FAILED
    for (const id of systemIds) {
      if (!map[id]) map[id] = "FAILED";
    }
    return map;
  } catch {
    return Object.fromEntries(systemIds.map((id) => [id, "FAILED"]));
  }
};

module.exports = { getPinSyncStatuses };

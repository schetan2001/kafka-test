const redis = require("../config/redis");

const getVehicleModes = async (systemId) => {
  try {
    const data = await redis.get(`vehicle:modes:${systemId}`);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

// Single MGET round-trip for all vehicles on the page
// Returns: { [systemId]: parsedModesObject | null }
const getVehicleModesMulti = async (systemIds) => {
  if (!systemIds.length) return {};
  try {
    const keys = systemIds.map((id) => `vehicle:modes:${id}`);
    const results = await redis.mget(...keys);
    const map = {};
    systemIds.forEach((id, i) => {
      map[id] = results[i] ? JSON.parse(results[i]) : null;
    });
    return map;
  } catch {
    // Fallback: null for all so DB telemetry values are used instead
    return Object.fromEntries(systemIds.map((id) => [id, null]));
  }
};

module.exports = { getVehicleModes, getVehicleModesMulti };

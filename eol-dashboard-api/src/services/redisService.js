const redis = require("../config/redis");

const getVehicleModes = async (systemId) => {
  try {
    const data = await redis.get(`vehicle:modes:${systemId}`);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

module.exports = { getVehicleModes };

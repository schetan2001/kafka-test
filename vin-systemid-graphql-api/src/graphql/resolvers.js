const { normalizeVins, getSystemIdsByVins } = require("../services/vinService");

const getSystemIds = async ({ vins }) => {
  const normalized = normalizeVins(vins);
  if (normalized.length === 0) {
    throw new Error("vins must be a non-empty array of strings");
  }
  return getSystemIdsByVins(normalized);
};

module.exports = { getSystemIds };

const SIGNAL_LEVELS = ["Poor", "Fair", "Good", "Excellent"];

const getSignalStrength = (rsrp, rsrq) => {
  if (isNaN(rsrp) || isNaN(rsrq)) return "No Signal";

  const rsrpLevel =
    rsrp >= -85 ? "Excellent" : rsrp >= -95 ? "Good" : rsrp >= -105 ? "Fair" : "Poor";

  const rsrqLevel =
    rsrq >= -10 ? "Excellent" : rsrq >= -12 ? "Good" : rsrq >= -15 ? "Fair" : "Poor";

  // Weaker of the two determines final signal strength
  return SIGNAL_LEVELS[
    Math.min(SIGNAL_LEVELS.indexOf(rsrpLevel), SIGNAL_LEVELS.indexOf(rsrqLevel))
  ];
};

const getChargingStatus = (lvl1, lvl2) => {
  if (String(lvl1) === "5") {
    if (String(lvl2) === "15") return "Fast Charging";
    if (String(lvl2) === "16") return "Slow Charging";
  }
  return "Not Charging";
};

module.exports = { getSignalStrength, getChargingStatus };

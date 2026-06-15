const { telemetryPool } = require("../config/db");
const { ELEMENT_IDS, LOW_TYRE_THRESHOLD } = require("../constants/elementIds");

const getVehicleTelemetry = async (systemIds, elementIds) => {
  const { rows } = await telemetryPool.query(
    `SELECT system_id, element_id, value, updated_time
     FROM t_telemetry_curr_values
     WHERE system_id = ANY($1)
       AND element_id = ANY($2)`,
    [systemIds, elementIds]
  );
  return rows;
};

const getBelowSocCount = async (systemIds) => {
  const { rows } = await telemetryPool.query(
    `SELECT COUNT(DISTINCT system_id) AS count
     FROM t_telemetry_curr_values
     WHERE system_id = ANY($1)
       AND element_id = $2
       AND value ~ '^-?[0-9]+(\\.[0-9]+)?$'
       AND value::float < 30`,
    [systemIds, ELEMENT_IDS.BATTERY_SOC]
  );
  return parseInt(rows[0].count);
};

const getLowTyreCount = async (systemIds) => {
  const { rows } = await telemetryPool.query(
    `SELECT COUNT(DISTINCT system_id) AS count
     FROM t_telemetry_curr_values
     WHERE system_id = ANY($1)
       AND element_id = ANY($2)
       AND value ~ '^-?[0-9]+(\\.[0-9]+)?$'
       AND value::float < $3`,
    [systemIds, [ELEMENT_IDS.TPMS_FRONT, ELEMENT_IDS.TPMS_REAR], LOW_TYRE_THRESHOLD]
  );
  return parseInt(rows[0].count);
};

const getChargingCount = async (systemIds) => {
  const { rows } = await telemetryPool.query(
    `SELECT COUNT(DISTINCT system_id) AS count
     FROM t_telemetry_curr_values
     WHERE system_id = ANY($1)
       AND element_id = $2
       AND value = '5'`,
    [systemIds, ELEMENT_IDS.MODE_LVL1]
  );
  return parseInt(rows[0].count);
};

module.exports = { getVehicleTelemetry, getBelowSocCount, getLowTyreCount, getChargingCount };

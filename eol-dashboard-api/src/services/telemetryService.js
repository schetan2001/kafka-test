const { telemetryPool } = require("../config/db");
const { ELEMENT_IDS, EVENT_6500_ELEMENT_IDS, EVENT_3101_ELEMENT_IDS, TPMS_FRONT_THRESHOLD, TPMS_REAR_THRESHOLD } = require("../constants/elementIds");

const SUMMARY_ELEMENT_IDS = [
  ELEMENT_IDS.BATTERY_SOC,
  ELEMENT_IDS.TPMS_FRONT,
  ELEMENT_IDS.TPMS_REAR,
  ELEMENT_IDS.MODE_LVL1,
];

const getVehicleTelemetry = async (systemIds) => {
  const { rows } = await telemetryPool.query(
    `SELECT system_id, element_id, value, updated_time
     FROM t_telemetry_curr_values
     WHERE system_id = ANY($1)
       AND (
         (element_id = ANY($2) AND event_type = 6500)
         OR
         (element_id = ANY($3) AND event_type = 3101)
       )`,
    [systemIds, EVENT_6500_ELEMENT_IDS, EVENT_3101_ELEMENT_IDS]
  );
  return rows;
};

const getSummaryCounts = async (systemIds) => {
  const { rows } = await telemetryPool.query(
    `SELECT
       COUNT(DISTINCT CASE
         WHEN element_id = $2
           AND value ~ '^-?[0-9]+(\\.[0-9]+)?$'
           AND value::float < 30
         THEN system_id END) AS below_soc_count,
       COUNT(DISTINCT CASE
         WHEN (
           (element_id = $3 AND value ~ '^-?[0-9]+(\\.[0-9]+)?$' AND value::float < $4)
           OR
           (element_id = $5 AND value ~ '^-?[0-9]+(\\.[0-9]+)?$' AND value::float < $6)
         ) THEN system_id END) AS low_tyre_count,
       COUNT(DISTINCT CASE
         WHEN element_id = $7 AND value = '5'
         THEN system_id END) AS charging_count
     FROM t_telemetry_curr_values
     WHERE system_id = ANY($1)
       AND element_id = ANY($8)
       AND event_type = 6500`,
    [
      systemIds,
      ELEMENT_IDS.BATTERY_SOC,
      ELEMENT_IDS.TPMS_FRONT,
      TPMS_FRONT_THRESHOLD,
      ELEMENT_IDS.TPMS_REAR,
      TPMS_REAR_THRESHOLD,
      ELEMENT_IDS.MODE_LVL1,
      SUMMARY_ELEMENT_IDS,
    ]
  );
  return {
    belowSocCount: parseInt(rows[0].below_soc_count),
    lowTyreCount:  parseInt(rows[0].low_tyre_count),
    chargingCount: parseInt(rows[0].charging_count),
  };
};

module.exports = { getVehicleTelemetry, getSummaryCounts };

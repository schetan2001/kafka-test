const { diagnosticPool } = require("../config/db");

const getActiveAlerts = async (systemIds) => {
  const { rows } = await diagnosticPool.query(
    `SELECT id, system_id, dtc_code, severity, status, ecu_type,
            occurrence_count, first_triggered_at, last_triggered_at
     FROM dtc_occurrences
     WHERE system_id = ANY($1)
       AND status = 'OPEN'
     ORDER BY last_triggered_at DESC`,
    [systemIds]
  );
  return rows;
};

const getAlertVehicleCount = async (systemIds) => {
  const { rows } = await diagnosticPool.query(
    `SELECT COUNT(DISTINCT system_id) AS count
     FROM dtc_occurrences
     WHERE system_id = ANY($1)
       AND status = 'OPEN'`,
    [systemIds]
  );
  return parseInt(rows[0].count);
};

module.exports = { getActiveAlerts, getAlertVehicleCount };

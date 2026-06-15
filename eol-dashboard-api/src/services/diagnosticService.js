const { diagnosticPool } = require("../config/db");

const getActiveAlerts = async (systemIds) => {
  const { rows } = await diagnosticPool.query(
    `SELECT id, system_id, dtc_code, dtc_description, severity, ecu_type, ticket_status, created_time
     FROM ff_dtc_tickets
     WHERE system_id = ANY($1)
       AND ticket_status = 'OPEN'
     ORDER BY created_time DESC`,
    [systemIds]
  );
  return rows;
};

const getAlertVehicleCount = async (systemIds) => {
  const { rows } = await diagnosticPool.query(
    `SELECT COUNT(DISTINCT system_id) AS count
     FROM ff_dtc_tickets
     WHERE system_id = ANY($1)
       AND ticket_status = 'OPEN'`,
    [systemIds]
  );
  return parseInt(rows[0].count);
};

module.exports = { getActiveAlerts, getAlertVehicleCount };

const { vehiclePool } = require("../config/db");

const getPagedVehicles = async (systemIds, limit, sqlOffset) => {
  const { rows } = await vehiclePool.query(
    `SELECT system_id, model, lifecycle_state, provisioned_time
     FROM t_vehicle
     WHERE system_id = ANY($1)
     ORDER BY system_id
     LIMIT $2 OFFSET $3`,
    [systemIds, limit, sqlOffset]
  );
  return rows;
};

const getTotalCount = async (systemIds) => {
  const { rows } = await vehiclePool.query(
    `SELECT COUNT(*) AS count FROM t_vehicle WHERE system_id = ANY($1)`,
    [systemIds]
  );
  return parseInt(rows[0].count);
};

const getAgeingCount = async (systemIds) => {
  const { rows } = await vehiclePool.query(
    `SELECT COUNT(*) AS count
     FROM t_vehicle
     WHERE system_id = ANY($1)
       AND provisioned_time IS NOT NULL
       AND (EXTRACT(EPOCH FROM NOW()) * 1000 - provisioned_time::float8) > 864000000`,
    [systemIds]
  );
  return parseInt(rows[0].count);
};

module.exports = { getPagedVehicles, getTotalCount, getAgeingCount };

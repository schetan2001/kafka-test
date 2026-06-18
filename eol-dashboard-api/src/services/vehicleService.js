const { vehiclePool } = require("../config/db");

const SORT_COLUMN_MAP = {
  model:              "model",
  ageing:             "provisioned_time",
  provisioningStatus: "lifecycle_state",
};
const ALLOWED_DIRECTIONS = new Set(["ASC", "DESC"]);

const resolveSortClause = (sortBy, sortOrder) => {
  const col = SORT_COLUMN_MAP[sortBy] || "provisioned_time";
  const dir = ALLOWED_DIRECTIONS.has((sortOrder || "").toUpperCase())
    ? sortOrder.toUpperCase()
    : sortBy ? "ASC" : "DESC";
  return `${col} ${dir}`;
};

const getPagedVehicles = async (systemIds, limit, sqlOffset, search = null, sortBy = null, sortOrder = null) => {
  const params = [systemIds, limit, sqlOffset];
  let searchClause = "";
  if (search) {
    params.push(`%${search}%`);
    searchClause = `AND (system_id ILIKE $${params.length} OR model ILIKE $${params.length})`;
  }
  const orderClause = resolveSortClause(sortBy, sortOrder);
  const { rows } = await vehiclePool.query(
    `SELECT system_id, model, lifecycle_state, provisioned_time
     FROM t_vehicle
     WHERE system_id = ANY($1)
       ${searchClause}
     ORDER BY ${orderClause}
     LIMIT $2 OFFSET $3`,
    params
  );
  return rows;
};

// When search is provided, returns count of matching vehicles (for pagination.total)
// When search is null, returns total count of all vehicles in systemIds (for summary.total)
const getTotalCount = async (systemIds, search = null) => {
  const params = [systemIds];
  let searchClause = "";
  if (search) {
    params.push(`%${search}%`);
    searchClause = `AND (system_id ILIKE $${params.length} OR model ILIKE $${params.length})`;
  }
  const { rows } = await vehiclePool.query(
    `SELECT COUNT(*) AS count FROM t_vehicle WHERE system_id = ANY($1) ${searchClause}`,
    params
  );
  return parseInt(rows[0].count);
};

const getAgeingCount = async (systemIds) => {
  const { rows } = await vehiclePool.query(
    `SELECT COUNT(*) AS count
     FROM t_vehicle
     WHERE system_id = ANY($1)
       AND provisioned_time IS NOT NULL
       AND provisioned_time < (EXTRACT(EPOCH FROM (NOW() - INTERVAL '10 days')) * 1000)::bigint`,
    [systemIds]
  );
  return parseInt(rows[0].count);
};

module.exports = { getPagedVehicles, getTotalCount, getAgeingCount };

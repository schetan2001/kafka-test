const pool = require('../db');

const resolvers = {


    // ── Filtered list with pagination ──────────────────────────────
    dtcOccurrences: async ({ ecu_type, status, severity, dtc_code, system_id, system_ids, limit = 50, offset = 0 }) => {
        const fetchForSystem = async (sid) => {
            const conditions = [];
            const params = [];
            let idx = 1;

            if (ecu_type) {
                conditions.push(`ecu_type = $${idx++}`);
                params.push(ecu_type);
            }
            if (status) {
                conditions.push(`status = $${idx++}`);
                params.push(status);
            }
            if (severity) {
                conditions.push(`severity = $${idx++}`);
                params.push(severity);
            }
            if (dtc_code) {
                conditions.push(`dtc_code = $${idx++}`);
                params.push(dtc_code);
            }
            if (sid) {
                conditions.push(`system_id = $${idx++}`);
                params.push(sid);
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

            // Get total count
            const countResult = await pool.query(
                `SELECT COUNT(*) as total FROM dtc_occurrences ${whereClause}`,
                params
            );

            // Get paginated data with template join
            const dataResult = await pool.query(
                `SELECT 
                    o.*,
                    m.dtc_name as dtc_name,
                    m.description,
                    t.template_id,
                    t.template_desc,
                    t.alert_msg
                 FROM dtc_occurrences o
                 LEFT JOIN templates t ON o.severity = t.severity
                 LEFT JOIN dtc_master m ON o.dtc_id = m.id
                 ${whereClause.replace(/(\w+)\s*=/g, 'o.$1 =')} 
                 ORDER BY o.created_at DESC 
                 LIMIT $${idx++} OFFSET $${idx++}`,
                [...params, limit, offset]
            );

            const data = dataResult.rows.map((row) => ({
                ...row,
                can_data: row.can_data ? JSON.stringify(row.can_data) : null,
                alert_template: row.template_id ? {
                    template_id: row.template_id,
                    template_desc: row.template_desc,
                    alert_msg: row.alert_msg
                } : null
            }));

            return {
                data,
                total_count: parseInt(countResult.rows[0].total, 10),
            };
        };

        const ids = system_ids || (system_id ? [system_id] : []);

        if (ids.length <= 1) {
            // Standard format for 0 or 1 system_id
            const res = await fetchForSystem(ids[0]);
            return {
                ...res,
                result: null
            };
        } else {
            // Multi-system format
            const results = await Promise.all(ids.map(async (sid) => {
                const res = await fetchForSystem(sid);
                return {
                    system_id: sid,
                    ...res
                };
            }));

            return {
                data: [],
                total_count: 0,
                result: results
            };
        }
    },

    // ── DTC Count by ECU (Active vs History) ───────────────────────
    dtcCountByEcu: async ({ system_id }) => {
        const conditions = ['ecu_type IS NOT NULL'];
        const params = [];
        let idx = 1;

        if (system_id) {
            conditions.push(`system_id = $${idx++}`);
            params.push(system_id);
        }

        const whereClause = `WHERE ${conditions.join(' AND ')}`;

        const { rows } = await pool.query(`
      SELECT
        ecu_type,
        COUNT(*) FILTER (WHERE status = 'OPEN')   AS active_count,
        COUNT(*) FILTER (WHERE status != 'OPEN')  AS history_count
      FROM dtc_occurrences
      ${whereClause}
      GROUP BY ecu_type
      ORDER BY ecu_type
    `, params);
        return rows.map((r) => ({
            ecu_type: r.ecu_type,
            active_count: parseInt(r.active_count, 10),
            history_count: parseInt(r.history_count, 10),
        }));
    },

    // ── Distribution by Severity ───────────────────────────────────
    dtcDistributionBySeverity: async ({ system_id, ecu_type }) => {
        const conditions = [];
        const params = [];
        let idx = 1;

        if (system_id) {
            conditions.push(`system_id = $${idx++}`);
            params.push(system_id);
        }
        if (ecu_type) {
            conditions.push(`ecu_type = $${idx++}`);
            params.push(ecu_type);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const { rows } = await pool.query(`
      SELECT
        severity,
        COUNT(*)::int AS count,
        ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0), 2) AS percentage
      FROM dtc_occurrences
      ${whereClause}
      GROUP BY severity
      ORDER BY severity
    `, params);
        return rows.map((r) => ({
            severity: r.severity,
            count: parseInt(r.count, 10),
            percentage: parseFloat(r.percentage),
        }));
    },

    // ── Distribution by Status ─────────────────────────────────────
    dtcDistributionByStatus: async ({ system_id, ecu_type }) => {
        const conditions = [];
        const params = [];
        let idx = 1;

        if (system_id) {
            conditions.push(`system_id = $${idx++}`);
            params.push(system_id);
        }
        if (ecu_type) {
            conditions.push(`ecu_type = $${idx++}`);
            params.push(ecu_type);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const { rows } = await pool.query(`
      SELECT
        CASE WHEN status = 'OPEN' THEN 'Active' ELSE 'Inactive' END AS status,
        COUNT(*)::int AS count,
        ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0), 2) AS percentage
      FROM dtc_occurrences
      ${whereClause}
      GROUP BY CASE WHEN status = 'OPEN' THEN 'Active' ELSE 'Inactive' END
      ORDER BY status
    `, params);
        return rows.map((r) => ({
            status: r.status,
            count: parseInt(r.count, 10),
            percentage: parseFloat(r.percentage),
        }));
    },

    // ── Recoverability Stats ───────────────────────────────────────
    recoverabilityStats: async ({ system_id, ecu_type }) => {
        const conditions = [];
        const params = [];
        let idx = 1;

        if (system_id) {
            conditions.push(`o.system_id = $${idx++}`);
            params.push(system_id);
        }
        if (ecu_type) {
            conditions.push(`o.ecu_type = $${idx++}`);
            params.push(ecu_type);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const { rows } = await pool.query(`
      SELECT
        COUNT(o.*)::int AS total,
        COUNT(o.*) FILTER (WHERE m.recoverable = true)::int AS recoverable_count,
        COUNT(o.*) FILTER (WHERE m.recoverable = false OR m.recoverable IS NULL)::int AS non_recoverable_count
      FROM dtc_occurrences o
      LEFT JOIN dtc_master m ON o.dtc_id = m.id
      ${whereClause}
    `, params);

        const { total, recoverable_count, non_recoverable_count } = rows[0];
        const t = parseInt(total, 10) || 1; // avoid division by zero

        return {
            total: parseInt(total, 10),
            recoverable_count: parseInt(recoverable_count, 10),
            non_recoverable_count: parseInt(non_recoverable_count, 10),
            recoverable_percentage: parseFloat(((recoverable_count / t) * 100).toFixed(2)),
            non_recoverable_percentage: parseFloat(((non_recoverable_count / t) * 100).toFixed(2)),
        };
    },

    // ── Total DTC Count ────────────────────────────────────────────
    totalDtcCount: async ({ ecu_type, status, severity }) => {
        const conditions = [];
        const params = [];
        let idx = 1;

        if (ecu_type) {
            conditions.push(`ecu_type = $${idx++}`);
            params.push(ecu_type);
        }
        if (status) {
            conditions.push(`status = $${idx++}`);
            params.push(status);
        }
        if (severity) {
            conditions.push(`severity = $${idx++}`);
            params.push(severity);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS total FROM dtc_occurrences ${whereClause}`,
            params
        );
        return parseInt(rows[0].total, 10);
    },
};

module.exports = resolvers;

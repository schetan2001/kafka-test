const pool = require('../notificationDb');

const ALLOWED_CATEGORIES = [14, 11, 107, 3, 31, 22, 33, 29, 1, 21, 32, 62, 63, 90, 91, 99, 92, 93, 100, 94, 95, 117, 26, 51, 47, 48];

const nonDtcResolvers = {
    // ── getNonDtcDetails Integration Operation ─────────────────────
    getNonDtcDetails: async ({ system_id, severity, limit, offset }) => {
        try {
            // Pass the entire array as the first parameter for ANY($1::int[])
            const queryParams = [ALLOWED_CATEGORIES];
            let paramIdx = 2; // Next parameter starts at $2

            let whereClauses = [`e.category_id = ANY($1::int[])`];

            // FOTA specific rule: only show category 26 if event_code is 0, 6, or 7
            whereClauses.push(`(e.category_id != 26 OR (e.message_info->>'event_code' IN ('0', '6', '7')))`);

            if (system_id) {
                whereClauses.push(`e.system_id = $${paramIdx++}`);
                queryParams.push(system_id);
            }

            let sql = `
                SELECT
                    e.category_id,
                    e.system_id,
                    e.device_received_time AS updated_time,
                    e.device_sent_time,
                    e.cloud_received_time,
                    e.created_time,
                    e.cloud_sent_time,
                    t.template_id,
                    t.severity,
                    t.template_desc,
                    t.alert_msg
                FROM c2c_notification_db.public.t_notification_event e
                LEFT JOIN c2c_notification_db.public.t_app_template t ON t.template_id = 
                    CASE 
                        WHEN e.category_id = 26 AND (e.message_info->>'event_code') = '0' THEN '26.1'
                        WHEN e.category_id = 26 AND (e.message_info->>'event_code') = '6' THEN '26.2'
                        WHEN e.category_id = 26 AND (e.message_info->>'event_code') = '7' THEN '26.3'
                        ELSE CAST(e.category_id AS text)
                    END
                WHERE ${whereClauses.join(' AND ')}
            `;

            if (severity) {
                sql += ` AND t.severity = $${paramIdx++}`;
                queryParams.push(severity);
            }

            sql += ` ORDER BY e.updated_time DESC`;

            if (limit !== undefined) {
                sql += ` LIMIT $${paramIdx++}`;
                queryParams.push(limit);
            }

            if (offset !== undefined) {
                sql += ` OFFSET $${paramIdx++}`;
                queryParams.push(offset);
            }

            const { rows } = await pool.query(sql, queryParams);

            return rows.map(event => ({
                category_id: event.category_id,
                system_id: event.system_id,
                updated_time: event.updated_time ? String(event.updated_time) : null,
		        device_sent_time: event.device_sent_time ? String(event.device_sent_time) : null,
                cloud_received_time: event.cloud_received_time ? String(event.cloud_received_time) : null,
                created_time: event.created_time ? String(event.created_time) : null,
                cloud_sent_time: event.cloud_sent_time ? String(event.cloud_sent_time) : null,
                severity: event.severity,
                alert_template: {
                    template_id: event.template_id,
                    template_desc: event.template_desc,
                    alert_msg: event.alert_msg
                }
            }));
        } catch (error) {
            console.error('Error fetching Non-DTC Details:', error);
            throw new Error('Failed to fetch non-dtc details.');
        }
    }
};

module.exports = nonDtcResolvers;

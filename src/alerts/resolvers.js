const diagnosticPool = require('../db');
const notificationPool = require('../notificationDb');

const ALLOWED_CATEGORIES = [14, 11, 107, 3, 31, 22, 33, 29, 1, 21, 32, 62, 63, 90, 91, 99, 92, 93, 100, 94, 95, 117, 26, 51, 47, 48];

const alertsResolvers = {
    getAlerts: async ({ system_id, severity, category_ids, limit, offset }) => {
        try {
            // 1. Fetch DTC Alerts
            const dtcConditions = [];
            const dtcParams = [];
            let dtcIdx = 1;

            if (system_id) {
                dtcConditions.push(`o.system_id = $${dtcIdx++}`);
                dtcParams.push(system_id);
            }
            if (severity) {
                dtcConditions.push(`o.severity = $${dtcIdx++}`);
                dtcParams.push(severity);
            }

            const dtcWhereClause = dtcConditions.length > 0 ? `WHERE ${dtcConditions.join(' AND ')}` : '';

            let dtcQuery = `
                SELECT 
                    o.dtc_id,
                    o.dtc_code,
                    o.system_id,
                    o.severity,
                    o.status,
                    o.first_triggered_at as updated_time,
                    o.ecu_type,
                    t.template_id,
                    t.template_desc,
                    t.alert_msg,
                    t.screen_id
                FROM dtc_occurrences o
                LEFT JOIN templates t ON o.severity = t.severity
                ${dtcWhereClause}
                ORDER BY o.created_at DESC
            `;

            if (limit !== undefined) {
                dtcQuery += ` LIMIT $${dtcIdx++}`;
                dtcParams.push(limit);
            }
            if (offset !== undefined) {
                dtcQuery += ` OFFSET $${dtcIdx++}`;
                dtcParams.push(offset);
            }

            const dtcResult = await diagnosticPool.query(dtcQuery, dtcParams);
            const dtcAlerts = dtcResult.rows.map(row => ({
                dtc_id: row.dtc_id,
                dtc_code: row.dtc_code,
                system_id: row.system_id,
                severity: row.severity,
                status: row.status,
                updated_time: row.updated_time ? Number(row.updated_time).toString() : null,
                ecu_type: row.ecu_type,
                alert_template: row.template_id ? {
                    template_id: row.template_id,
                    template_desc: row.template_desc,
                    alert_msg: row.alert_msg,
                    screen_id: row.screen_id
                } : null
            }));

            // 2. Fetch Non-DTC Alerts
            const categoriesToFilter = (category_ids && category_ids.length > 0) ? category_ids : ALLOWED_CATEGORIES;
            const nonDtcConditions = [`e.category_id = ANY($1::int[])`];
            const nonDtcParams = [categoriesToFilter];
            let nonDtcIdx = 2;

            // FOTA specific rule
            nonDtcConditions.push(`(e.category_id != 26 OR (e.message_info->>'event_code' IN ('0', '6', '7')))`);

            if (system_id) {
                nonDtcConditions.push(`e.system_id = $${nonDtcIdx++}`);
                nonDtcParams.push(system_id);
            }

            let nonDtcSql = `
                SELECT 
                    e.category_id,
                    e.system_id,
                    e.updated_time,
                    t.template_id,
                    t.severity,
                    t.template_desc,
                    t.alert_msg,
                    t.screen_id
                FROM c2c_notification_db.public.t_notification_event e
                LEFT JOIN c2c_notification_db.public.t_app_template t ON t.template_id = 
                    CASE 
                        WHEN e.category_id = 26 AND (e.message_info->>'event_code') = '0' THEN '26.1'
                        WHEN e.category_id = 26 AND (e.message_info->>'event_code') = '6' THEN '26.2'
                        WHEN e.category_id = 26 AND (e.message_info->>'event_code') = '7' THEN '26.3'
                        ELSE CAST(e.category_id AS text)
                    END
                WHERE ${nonDtcConditions.join(' AND ')}
            `;

            if (severity) {
                nonDtcSql += ` AND t.severity = $${nonDtcIdx++}`;
                nonDtcParams.push(severity);
            }

            nonDtcSql += ` ORDER BY e.updated_time DESC`;

            if (limit !== undefined) {
                nonDtcSql += ` LIMIT $${nonDtcIdx++}`;
                nonDtcParams.push(limit);
            }
            if (offset !== undefined) {
                nonDtcSql += ` OFFSET $${nonDtcIdx++}`;
                nonDtcParams.push(offset);
            }

            const nonDtcResult = await notificationPool.query(nonDtcSql, nonDtcParams);
            const nonDtcAlerts = nonDtcResult.rows.map(event => ({
                category_id: event.category_id,
                system_id: event.system_id,
                updated_time: event.updated_time ? Number(event.updated_time).toString() : null,
                severity: event.severity,
                alert_template: {
                    template_id: event.template_id,
                    template_desc: event.template_desc,
                    alert_msg: event.alert_msg,
                    screen_id: event.screen_id
                }
            }));

            return {
                dtc: dtcAlerts,
                non_dtc: nonDtcAlerts
            };
        } catch (error) {
            console.error('Error fetching combined alerts:', error);
            throw new Error('Failed to fetch alerts.');
        }
    }
};

module.exports = alertsResolvers;

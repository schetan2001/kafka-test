const pool = require('../db');

const resolvers = {
    dtcTickets: async ({
        request_id,
        display_id,
        system_id,
        vin,
        dtc_id,
        dtc_code,
        ecu_type,
        severity,
        ticket_status,
        limit = 50,
        offset = 0
    }) => {
        const fetchForSystem = async (sid) => {
            const conditions = [];
            const params = [];
            let idx = 1;

            if (request_id) { conditions.push(`request_id = $${idx++}`); params.push(request_id); }
            if (display_id) { conditions.push(`display_id = $${idx++}`); params.push(display_id); }
            if (vin) { conditions.push(`vin = $${idx++}`); params.push(vin); }
            if (dtc_id) { conditions.push(`dtc_id = $${idx++}`); params.push(dtc_id); }
            if (dtc_code) { conditions.push(`dtc_code = $${idx++}`); params.push(dtc_code); }
            if (ecu_type) { conditions.push(`ecu_type = $${idx++}`); params.push(ecu_type); }
            if (severity) { conditions.push(`severity = $${idx++}`); params.push(severity); }
            if (ticket_status) { conditions.push(`ticket_status = $${idx++}`); params.push(ticket_status); }
            
            if (sid) {
                conditions.push(`system_id = $${idx++}`);
                params.push(sid);
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

            // Get total count
            const countResult = await pool.query(
                `SELECT COUNT(*) as total FROM ff_dtc_tickets ${whereClause}`,
                params
            );

            const actualOffset = offset > 0 ? (offset - 1) * limit : 0;

            // Get paginated data
            const dataResult = await pool.query(
                `SELECT *
                 FROM ff_dtc_tickets 
                 ${whereClause} 
                 ORDER BY created_time DESC 
                 LIMIT $${idx++} OFFSET $${idx++}`,
                [...params, limit, actualOffset]
            );

            const data = dataResult.rows.map(row => ({
                ...row,
                created_time: row.created_time ? String(row.created_time) : null,
                resolved_time: row.resolved_time ? String(row.resolved_time) : null
            }));

            return {
                data,
                total_count: parseInt(countResult.rows[0].total, 10)
            };
        };

        const ids = system_id || [];
        
        // If no IDs are provided, we could either return all data generally or require an ID.
        // Given the requirement "minimum of 1", if none is provided but the parameter wasn't marked required in schema,
        // we handles an empty array gracefully.
        
        const results = await Promise.all(ids.map(async (sid) => {
            const res = await fetchForSystem(sid);
            return {
                system_id: sid,
                ...res
            };
        }));

        return {
            result: results
        };
    }
};

module.exports = resolvers;

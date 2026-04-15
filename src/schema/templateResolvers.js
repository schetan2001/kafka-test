const pool = require('../db');

const templateResolvers = {
    // ── Template CRUD Operations ───────────────────────────────────
    getTemplates: async ({ search, limit = 50, offset = 0 }) => {
        let whereClause = '';
        const params = [];
        let idx = 1;

        if (search) {
            whereClause = `WHERE template_id ILIKE $${idx} OR severity ILIKE $${idx} OR template_desc ILIKE $${idx} OR alert_msg ILIKE $${idx} OR CAST(screen_id AS TEXT) ILIKE $${idx}`;
            params.push(`%${search}%`);
            idx++;
        }

        const countResult = await pool.query(
            `SELECT COUNT(*) as total FROM templates ${whereClause}`,
            params
        );

        const actualOffset = offset > 0 ? (offset - 1) * limit : 0;

        const dataResult = await pool.query(
            `SELECT * FROM templates ${whereClause} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
            [...params, limit, actualOffset]
        );

        return {
            data: dataResult.rows,
            totalCount: parseInt(countResult.rows[0].total, 10)
        };
    },

    getTemplateById: async ({ template_id }) => {
        const { rows } = await pool.query('SELECT * FROM templates WHERE template_id = $1', [template_id]);
        return rows[0] || null;
    },

    createTemplate: async ({ input }) => {
        const { template_id, severity, template_desc, alert_msg, screen_id } = input;
        try {
            const { rows } = await pool.query(
                `INSERT INTO templates (template_id, severity, template_desc, alert_msg, screen_id, created_at)
                 VALUES ($1, $2, $3, $4, $5, NOW())
                 RETURNING *`,
                [template_id, severity, template_desc, alert_msg, screen_id]
            );
            return rows[0];
        } catch (error) {
            console.error('Error creating template:', error);
            throw new Error('Failed to create template. It might already exist.');
        }
    },

    updateTemplate: async ({ template_id, input }) => {
        const { severity, template_desc, alert_msg, screen_id } = input;
        
        const fields = [];
        const values = [];
        let idx = 1;

        if (severity !== undefined) {
            fields.push(`severity = $${idx++}`);
            values.push(severity);
        }
        if (template_desc !== undefined) {
            fields.push(`template_desc = $${idx++}`);
            values.push(template_desc);
        }
        if (alert_msg !== undefined) {
            fields.push(`alert_msg = $${idx++}`);
            values.push(alert_msg);
        }
        if (screen_id !== undefined) {
            fields.push(`screen_id = $${idx++}`);
            values.push(screen_id);
        }
        if (fields.length === 0) {
            throw new Error('No fields to update');
        }

        fields.push(`updated_at = NOW()`);
        
        values.push(template_id); // The WHERE condition parameter

        const { rows } = await pool.query(
            `UPDATE templates 
             SET ${fields.join(', ')} 
             WHERE template_id = $${idx} 
             RETURNING *`,
            values
        );

        if (rows.length === 0) {
            throw new Error('Template not found');
        }

        return rows[0];
    },

    deleteTemplate: async ({ template_id }) => {
        const { rowCount } = await pool.query(
            'DELETE FROM templates WHERE template_id = $1',
            [template_id]
        );
        return rowCount > 0;
    },
};

module.exports = templateResolvers;

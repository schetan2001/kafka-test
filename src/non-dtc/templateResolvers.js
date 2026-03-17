const pool = require('../notificationDb');

const nonDtcTemplateResolvers = {
    // ── t_app_template CRUD Operations ─────────────────────────────
    getAppTemplates: async () => {
        const { rows } = await pool.query('SELECT * FROM c2c_notification_db.public.t_app_template ORDER BY created_at DESC');
        return rows;
    },

    getAppTemplateById: async ({ template_id }) => {
        const { rows } = await pool.query('SELECT * FROM c2c_notification_db.public.t_app_template WHERE template_id = $1', [template_id]);
        return rows[0] || null;
    },

    createAppTemplate: async ({ input }) => {
        const { template_id, severity, template_desc, alert_msg } = input;
        try {
            const { rows } = await pool.query(
                `INSERT INTO c2c_notification_db.public.t_app_template (template_id, severity, template_desc, alert_msg, created_at)
                 VALUES ($1, $2, $3, $4, NOW())
                 RETURNING *`,
                [template_id, severity, template_desc, alert_msg]
            );
            return rows[0];
        } catch (error) {
            console.error('Error creating app template:', error);
            throw new Error('Failed to create app template. It might already exist.');
        }
    },

    updateAppTemplate: async ({ template_id, input }) => {
        const { severity, template_desc, alert_msg } = input;
        
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

        if (fields.length === 0) {
            throw new Error('No fields to update');
        }

        fields.push(`updated_at = NOW()`);
        
        values.push(template_id);

        const { rows } = await pool.query(
            `UPDATE c2c_notification_db.public.t_app_template 
             SET ${fields.join(', ')} 
             WHERE template_id = $${idx} 
             RETURNING *`,
            values
        );

        if (rows.length === 0) {
            throw new Error('App template not found');
        }

        return rows[0];
    },

    deleteAppTemplate: async ({ template_id }) => {
        const { rowCount } = await pool.query(
            'DELETE FROM c2c_notification_db.public.t_app_template WHERE template_id = $1',
            [template_id]
        );
        return rowCount > 0;
    },
};

module.exports = nonDtcTemplateResolvers;

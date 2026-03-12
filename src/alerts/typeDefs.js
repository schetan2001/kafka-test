const { buildSchema } = require('graphql');

const alertsSchema = buildSchema(`
  type AlertTemplate {
    template_id: String
    template_desc: String
    alert_msg: String
  }

  type DtcAlert {
    dtc_id: Int
    dtc_code: String
    system_id: String
    severity: String
    status: String
    updated_time: String
    ecu_type: String
    alert_template: AlertTemplate
  }

  type NonDtcAlert {
    category_id: Int!
    system_id: String
    updated_time: String
    severity: String
    alert_template: AlertTemplate
  }

  type AlertsResponse {
    dtc: [DtcAlert!]!
    non_dtc: [NonDtcAlert!]!
  }

  type Query {
    getAlerts(system_id: String, severity: String, limit: Int, offset: Int): AlertsResponse!
  }
`);

module.exports = alertsSchema;

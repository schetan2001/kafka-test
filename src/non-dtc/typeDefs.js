const { buildSchema } = require('graphql');

const nonDtcSchema = buildSchema(`
  type AlertTemplate {
    template_id: String
    template_desc: String
    alert_msg: String
  }

  type NonDtcDetail {
    category_id: Int!
    system_id: String
    updated_time: String
    severity: String
    alert_template: AlertTemplate
  }

  type Query {
    getNonDtcDetails(
      system_id: String,
      severity: String,
      limit: Int,
      offset: Int
    ): [NonDtcDetail!]!
  }
`);

module.exports = nonDtcSchema;

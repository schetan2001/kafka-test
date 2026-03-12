const { buildSchema } = require('graphql');

const schema = buildSchema(`
  type AlertTemplate {
    template_id: String
    template_desc: String
    alert_msg: String
  }

  type DtcOccurrence {
    id: ID!
    dtc_id: Int
    dtc_code: String
    system_id: String
    severity: String
    status: String
    rule_version: Int
    first_triggered_at: String
    last_triggered_at: String
    occurrence_count: Int
    can_data: String
    created_at: String
    created_by: Int
    updated_at: String
    updated_by: Int
    cleared_at: String
    ecu_type: String
    dtc_name: String
    description: String
    alert_template: AlertTemplate
  }

  type DtcCountByEcu {
    ecu_type: String!
    active_count: Int!
    history_count: Int!
  }

  type SeverityDistribution {
    severity: String!
    count: Int!
    percentage: Float!
  }

  type StatusDistribution {
    status: String!
    count: Int!
    percentage: Float!
  }

  type RecoverabilityStats {
    total: Int!
    recoverable_count: Int!
    non_recoverable_count: Int!
    recoverable_percentage: Float!
    non_recoverable_percentage: Float!
  }

  type DtcOccurrenceResult {
    data: [DtcOccurrence!]!
    total_count: Int!
  }

  type Query {


    dtcOccurrences(
      ecu_type: String
      status: String
      severity: String
      dtc_code: String
      system_id: String
      limit: Int
      offset: Int
    ): DtcOccurrenceResult!

    dtcCountByEcu(system_id: String): [DtcCountByEcu!]!

    dtcDistributionBySeverity(system_id: String, ecu_type: String): [SeverityDistribution!]!

    dtcDistributionByStatus(system_id: String, ecu_type: String): [StatusDistribution!]!

    recoverabilityStats(system_id: String, ecu_type: String): RecoverabilityStats!

    totalDtcCount(ecu_type: String, status: String, severity: String): Int!
  }
`);

module.exports = schema;

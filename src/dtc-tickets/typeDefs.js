const { buildSchema } = require('graphql');

const schema = buildSchema(`
  type DtcTicket {
    id: ID!
    request_id: String
    display_id: String
    system_id: String
    vin: String
    dtc_id: String
    dtc_code: String
    dtc_description: String
    ecu_type: String
    severity: String
    ticket_status: String
    created_time: String
    resolved_time: String
    location_address: String
  }

  type SystemWiseTicketResult {
    system_id: String
    data: [DtcTicket!]!
    total_count: Int!
  }

  type DtcTicketResult {
    result: [SystemWiseTicketResult!]
  }

  type Query {
    dtcTickets(
      request_id: String
      display_id: String
      system_id: [String]
      vin: String
      dtc_id: String
      dtc_code: String
      ecu_type: String
      severity: String
      ticket_status: String
      limit: Int
      offset: Int
    ): DtcTicketResult!
  }
`);

module.exports = schema;

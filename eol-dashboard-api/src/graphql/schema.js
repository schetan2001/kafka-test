const { buildSchema } = require("graphql");

const schema = buildSchema(`
  type Query {
    getEolDashboard(
      systemIds: [String!]!
      limit: Int
      offset: Int
    ): EolDashboardResponse
  }

  type EolDashboardResponse {
    summary: DashboardSummary
    pagination: PaginationInfo
    vehicles: [VehicleEolData]
  }

  type DashboardSummary {
    total: Int
    belowThirtyPercentSoc: Int
    lowTyrePsi: Int
    charging: Int
    alerts: Int
    ageingAboveTenDays: Int
  }

  type PaginationInfo {
    total: Int
    limit: Int
    offset: Int
  }

  type VehicleEolData {
    systemId: String
    model: String
    provisioningStatus: String
    ageing: Int
    lastTracked: String
    batterySoc: String
    batteryTempMin: String
    batteryTempMax: String
    tpmsFront: String
    tpmsRear: String
    lowTyrePsi: Boolean
    lteSignalStrength: String
    chargingStatus: String
    alertCount: Int
    alerts: [DtcAlert]
  }

  type DtcAlert {
    id: ID
    dtcCode: String
    dtcDescription: String
    severity: String
    ecuType: String
    ticketStatus: String
    createdTime: String
  }
`);

module.exports = schema;

const { buildSchema } = require("graphql");

const schema = buildSchema(`
  type Query {
    getSystemIds(vins: [String!]!): [VinSystemId!]!
  }

  type VinSystemId {
    vin: String!
    systemId: String
  }
`);

module.exports = schema;

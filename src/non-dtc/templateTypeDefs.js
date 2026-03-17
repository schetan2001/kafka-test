const { buildSchema } = require('graphql');

const nonDtcTemplateSchema = buildSchema(`
  type AppTemplate {
    template_id: String!
    severity: String!
    template_desc: String
    alert_msg: String
    created_at: String
    updated_at: String
  }

  input AppTemplateInput {
    template_id: String!
    severity: String!
    template_desc: String
    alert_msg: String
  }

  input UpdateAppTemplateInput {
    severity: String
    template_desc: String
    alert_msg: String
  }

  type AppTemplateResult {
    data: [AppTemplate!]!
    totalCount: Int!
  }

  type Query {
    getAppTemplates(search: String, limit: Int, offset: Int): AppTemplateResult!
    getAppTemplateById(template_id: String!): AppTemplate
  }

  type Mutation {
    createAppTemplate(input: AppTemplateInput!): AppTemplate!
    updateAppTemplate(template_id: String!, input: UpdateAppTemplateInput!): AppTemplate!
    deleteAppTemplate(template_id: String!): Boolean!
  }
`);

module.exports = nonDtcTemplateSchema;

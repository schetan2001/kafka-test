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

  type Query {
    getAppTemplates: [AppTemplate!]!
    getAppTemplateById(template_id: String!): AppTemplate
  }

  type Mutation {
    createAppTemplate(input: AppTemplateInput!): AppTemplate!
    updateAppTemplate(template_id: String!, input: UpdateAppTemplateInput!): AppTemplate!
    deleteAppTemplate(template_id: String!): Boolean!
  }
`);

module.exports = nonDtcTemplateSchema;

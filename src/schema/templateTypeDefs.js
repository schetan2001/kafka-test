const { buildSchema } = require('graphql');

const templateSchema = buildSchema(`
  type Template {
    template_id: String!
    severity: String!
    template_desc: String
    alert_msg: String
    created_at: String
    updated_at: String
    screen_id: Float
  }

  input TemplateInput {
    template_id: String!
    severity: String!
    template_desc: String
    alert_msg: String
    screen_id: Float
  }

  input UpdateTemplateInput {
    severity: String
    template_desc: String
    alert_msg: String
    screen_id: Float
  }

  type TemplateResult {
    data: [Template!]!
    totalCount: Int!
  }

  type Query {
    getTemplates(search: String, limit: Int, offset: Int): TemplateResult!
    getTemplateById(template_id: String!): Template
  }

  type Mutation {
    createTemplate(input: TemplateInput!): Template!
    updateTemplate(template_id: String!, input: UpdateTemplateInput!): Template!
    deleteTemplate(template_id: String!): Boolean!
  }
`);

module.exports = templateSchema;

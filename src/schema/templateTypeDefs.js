const { buildSchema } = require('graphql');

const templateSchema = buildSchema(`
  type Template {
    template_id: String!
    severity: String!
    template_desc: String
    alert_msg: String
    created_at: String
    updated_at: String
  }

  input TemplateInput {
    template_id: String!
    severity: String!
    template_desc: String
    alert_msg: String
  }

  input UpdateTemplateInput {
    severity: String
    template_desc: String
    alert_msg: String
  }

  type Query {
    getTemplates: [Template!]!
    getTemplateById(template_id: String!): Template
  }

  type Mutation {
    createTemplate(input: TemplateInput!): Template!
    updateTemplate(template_id: String!, input: UpdateTemplateInput!): Template!
    deleteTemplate(template_id: String!): Boolean!
  }
`);

module.exports = templateSchema;

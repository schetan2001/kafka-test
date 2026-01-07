const express = require("express");
const { graphqlHTTP } = require("express-graphql");
const { buildSchema } = require("graphql");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

const INGRESS_API_KEY = process.env.API_KEY;
const BASE_URL = process.env.BASE_URL;
const CAMPAIGN_API_KEY = process.env.CAMPAIGN_API_KEY;

// Middleware for API Key verification
app.use("/package-download", (req, res, next) => {
  const apiKey = req.headers["x-api-key"];

  if (!INGRESS_API_KEY) {
    console.error("INGRESS_API_KEY is not defined in the environment.");
    return res
      .status(500)
      .json({ error: "Server configuration error: Missing API key." });
  }

  if (!apiKey || apiKey !== INGRESS_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
});

const schema = buildSchema(`
  type Query {
    getEligiblePackage(systemId: String!): JSON
    downloadPackage(packageId: String!): JSON
  }

  scalar JSON
`);

const root = {
  getEligiblePackage: async ({ systemId }) => {
    try {
      const response = await axios.get(
        `${BASE_URL}/ota/campaign-manager/vehicles/${systemId}/ecus/versions/eligible?ecuName=composite&partNumber=585`,
        {
          headers: {
            accept: "*/*",
            "api-key": CAMPAIGN_API_KEY,
            "x-requestor": "fota",
          },
        }
      );
      return response.data;
    } catch (error) {
      if (error.response && error.response.data) {
        return error.response.data;
      }
      return { message: error.message };
    }
  },
  downloadPackage: async ({ packageId }) => {
    try {
      const response = await axios.get(
        `${BASE_URL}/ota/campaign-manager/packages/${packageId}/download-package`,
        {
          headers: {
            accept: "*/*",
            "api-key": CAMPAIGN_API_KEY,
            "x-requestor": "fota",
          },
        }
      );
      return response.data;
    } catch (error) {
      if (error.response && error.response.data) {
        return error.response.data;
      }
      return { message: error.message };
    }
  },
};

// Create GraphQL endpoint
app.use(
  "/package-download",
  graphqlHTTP({
    schema: schema,
    rootValue: root,
    graphiql: true,
  })
);

const PORT = process.env.PORT || 4005;
app.listen(PORT, () => {
  console.log(`GraphQL server listening on port ${PORT}`);
});

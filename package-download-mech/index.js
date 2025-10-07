const express = require("express");
const { graphqlHTTP } = require("express-graphql");
const { buildSchema } = require("graphql");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

const INGRESS_API_KEY = process.env.API_KEY || '47629e22-f0d7-4af0-bab9-559689ef24ee';

// Middleware for API Key verification
app.use("/package-download", (req, res, next) => {
  const apiKey = req.headers["x-api-key"];

  if (!INGRESS_API_KEY) {
    console.error("INGRESS_API_KEY is not defined in the environment.");
    return res.status(500).json({ error: "Server configuration error: Missing API key." });
  }

  if (!apiKey || apiKey !== INGRESS_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
});

const schema = buildSchema(`
  type Query {
    getEligiblePackage(systemId: String!): EligiblePackageResponse
    downloadPackage(packageId: String!): DownloadPackageResponse
  }

  type EligiblePackageResponse {
    message: String
    ecuPackageDetail: EcuPackageDetail
  }

  type EcuPackageDetail {
    packageId: String
    packageName: String
    fileName: String
    model: String
    ecuName: String
    packageType: Int
    targetVersion: String
    sourceVersion: String
    partNumber: String
    updateType: String
    checksum: String
    partCode: String
    hardwareVersion: String
    planTime: String
  }

  type DownloadPackageResponse {
    message: String
    packageInfo: PackageInfo
  }

  type PackageInfo {
    downloadUrl: String
    security: SecurityInfo
  }

  type SecurityInfo {
    signature: String
    certificate: String
  }
`);

const root = {
  getEligiblePackage: async ({ systemId }) => {
    try {
      const response = await axios.get(
        `https://qa-reg.gcp-c2c-repl10.qualcomm.com/ota/campaign-manager/vehicles/${systemId}/ecus/versions/eligible?ecuName=composite&partNumber=585`,
        {
          headers: {
            accept: "*/*",
            "api-key": "WTJGdGNHRnBaMjVBVFdGdVlXZGxjakV5TXc",
            "x-requestor": "admin",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(error);
      throw new Error("Failed to fetch eligible package");
    }
  },
  downloadPackage: async ({ packageId }) => {
    try {
      const response = await axios.get(
        `https://qa-reg.gcp-c2c-repl10.qualcomm.com/ota/campaign-manager/packages/${packageId}/download-package`,
        {
          headers: {
            accept: "*/*",
            "api-key": "WTJGdGNHRnBaMjVBVFdGdVlXZGxjakV5TXc",
            "x-requestor": "admin",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(error);
      throw new Error("Failed to download package");
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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`GraphQL server listening on port ${PORT}`);
});
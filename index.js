const express = require("express");
const { graphqlHTTP } = require("express-graphql");
const { buildSchema } = require("graphql");
const axios = require("axios");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const app = express();

const corsOptions = {
  origin: [
    "https://tap-sit.royalenfield.com",
    "https://wingman-portal-preprod.royalenfield.com",
    "http://localhost:3000",
    "http://localhost:3001",
  ],
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
};

app.use(cors(corsOptions));

const INGRESS_API_KEY = process.env.API_KEY;
const BASE_URL = process.env.BASE_URL;
const GEOFENCE_API_KEY = process.env.GEOFENCE_API_KEY;

// Middleware for API Key verification
app.use("/circular-geofence", (req, res, next) => {
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
  scalar JSON

  type Query {
    getGeoFences(systemId: String!): JSON
  }

  type Mutation {
    createGeofence(name: String!, radius: Int!, coordinates: [[Float!]!]!, systemId: String!, notification: Int!): JSON
    updateGeofence(geoId: String!, name: String!, radius: Int!, coordinates: [[Float!]!]!, systemId: String!, notification: Int!): JSON
    deleteGeofence(geoId: String!): JSON
    enabledisableGeofence(systemId: String!, geoId: String!, action: String!): JSON
  }
`);

// GraphQL resolver
const root = {
  createGeofence: async ({
    name,
    radius,
    coordinates,
    systemId,
    notification,
  }) => {
    try {
      const api1Payload = {
        name: name,
        geometryType: "circle",
        radius: radius,
        coordinates: coordinates,
        isActive: true,
        tolerance: 0,
        type: "personal",
        isPOI: true,
        tag: "Office",
      };

      const api1Response = await axios.post(
        `${BASE_URL}/location/locations`,
        api1Payload,
        {
          headers: {
            accept:
              "application/com.c2c.telemetry.location.dto.v1.response.locationresponse.v1+json",
            "api-key": GEOFENCE_API_KEY,
            "x-requestor": "test",
            "Content-Type":
              "application/com.c2c.telemetry.location.dto.v1.request.locationrequestnew.v1+json",
          },
        }
      );

      const geoId = api1Response.data?.responseData?.geoId;

      if (!geoId) {
        throw new Error("Failed to retrieve geoId from API 1 response");
      }

      const api2Payload = {
        mapping: [
          {
            schedule: {},
            notification: notification,
            isEdgeEnabled: 1,
            ruleId: 0,
            isActive: true,
            ruleExpression: "string",
            name: name,
            systemId: systemId,
          },
        ],
      };

      const api2Response = await axios.post(
        `${BASE_URL}/location/vehicles/geo-fences/${geoId}`,
        api2Payload,
        {
          headers: {
            accept:
              "application/com.c2c.telemetry.location.dto.v1.response.vehiclelocationresponse.v1+json",
            "api-key": GEOFENCE_API_KEY,
            "x-requestor": "test",
            "Content-Type":
              "application/com.c2c.telemetry.location.dto.v1.request.addtelemetrylocationdetailsrequestnew.v1+json",
          },
        }
      );

      const api2Data = api2Response.data;
      let geofenceStatus = null;
      let vehicleMappingId = null;

      if (
        api2Response.status === 200 &&
        api2Data?.geofenceMappings?.[0]?.message
          ?.toLowerCase()
          .includes("initiated")
      ) {
        vehicleMappingId = api2Data.geofenceMappings[0].vehicleMappingId;

        if (vehicleMappingId) {
          // Wait for a moment before checking the status
          await new Promise((resolve) => setTimeout(resolve, 2000)); // 2-second delay

          const statusResponse = await axios.get(
            `${BASE_URL}/location/vehicles/geo-fences?vehicleMappingId=${vehicleMappingId}`,
            {
              headers: {
                accept: "application/json",
                "api-key": GEOFENCE_API_KEY,
                "x-requestor": "test",
              },
            }
          );
          geofenceStatus = statusResponse.data?.responseData?.geofenceStatus || "PENDING";
        }
      }

      const api2GeofenceMappings = api2Data?.geofenceMappings?.map(
        (mapping) => ({
          systemId: mapping.systemId,
          vehicleMappingId: mapping.vehicleMappingId,
          message: mapping.message,
        })
      );

      return {
        message: "Geofence creation process completed.",
        geoId: geoId,
        vehicleMappingId: vehicleMappingId,
        geofenceStatus: geofenceStatus,
        details: api2Data.geofenceMappings,
      };
    } catch (error) {
      console.error(
        "Error in createGeofence:",
        JSON.stringify(error.response?.data, null, 2) || error.message
      );

      const errorMessage =
        error.response?.data?.errors?.[0]?.message ||
        error.message ||
        "An unknown error occurred during geofence creation.";

      // Return a simple error object
      return {
        error: errorMessage,
        details: error.response?.data,
      };
    }
  },
  getGeoFences: async ({ systemId }) => {
    try {
      const response = await axios.get(
        `${BASE_URL}/location/vehicles/${systemId}/geo-fences?isActive=true`,
        {
          headers: {
            accept:
              "application/com.c2c.telemetry.location.dto.v1.response.vehiclelocationresponse.v1+json",
            "api-key": GEOFENCE_API_KEY,
            "x-requestor": "test",
          },
        }
      );
      return response.data;
    } catch (error) {
      return error.response?.data || { message: error.message };
    }
  },

  updateGeofence: async ({
    geoId,
    name,
    radius,
    coordinates,
    systemId,
    notification,
  }) => {
    try {
      // API 1 update
      const api1Payload = {
        name,
        geometryType: "circle",
        radius,
        coordinates,
        isActive: true,
        tolerance: 0,
        type: "personal",
        isPOI: true,
        tag: "Office",
      };
      await axios.put(`${BASE_URL}/location/locations/${geoId}`, api1Payload, {
        headers: {
          accept:
            "application/com.c2c.telemetry.location.dto.v1.response.locationresponse.v1+json",
          "api-key": GEOFENCE_API_KEY,
          "x-requestor": "test",
          "Content-Type":
            "application/com.c2c.telemetry.location.dto.v1.request.locationrequestnew.v1+json",
        },
      });

      // API 2 notification update
      const api2Payload = {
        mapping: [
          {
            schedule: {},
            notification,
            isEdgeEnabled: 1,
            ruleId: 0,
            isActive: true,
            ruleExpression: "string",
            name,
            systemId,
          },
        ],
      };
      const api2Response = await axios.put(
        `${BASE_URL}/location/vehicles/${systemId}/geo-fences/${geoId}`,
        api2Payload,
        {
          headers: {
            accept:
              "application/com.c2c.telemetry.location.dto.v1.response.vehiclelocationresponse.v1+json",
            "api-key": GEOFENCE_API_KEY,
            "x-requestor": "test",
            "Content-Type":
              "application/com.c2c.telemetry.location.dto.v1.request.addtelemetrylocationdetailsrequestnew.v1+json",
          },
        }
      );
      return api2Response.data;
    } catch (error) {
      return error.response?.data || { message: error.message };
    }
  },

  deleteGeofence: async ({ geoId }) => {
    try {
      const api1Response = await axios.delete(
        `${BASE_URL}/location/locations/${geoId}?isPOI=true`,
        {
          headers: {
            accept:
              "application/com.c2c.telemetry.location.dto.v1.response.locationresponsedata.v1+json",
            "api-key": GEOFENCE_API_KEY,
            "x-requestor": "test",
          },
        }
      );
      return api1Response.data;
    } catch (error) {
      return error.response?.data || { message: error.message };
    }
  },

  enabledisableGeofence: async ({ systemId, geoId, action }) => {
    try {
      const lowerCaseAction = String(action || "").toLowerCase();
      if (!["enable", "disable"].includes(lowerCaseAction)) {
        throw new Error("Action must be either 'enable' or 'disable'.");
      }
      const response = await axios.put(
        `${BASE_URL}/location/vehicles/${systemId}/geo-fences/${geoId}?action=${lowerCaseAction}`,
        {},
        {
          headers: {
            accept:
              "application/com.c2c.telemetry.location.dto.v1.response.vehiclelocationresponse.v1+json",
            "api-key": GEOFENCE_API_KEY,
            "x-requestor": "test",
            "Content-Type":
              "application/com.c2c.telemetry.location.dto.v1.request.telemetrylocationdetailsrequestnew.v1+json",
          },
        }
      );
      return response.data;
    } catch (error) {
      return error.response?.data || { message: error.message };
    }
  },
};

// Create GraphQL endpoint
app.use(
  "/circular-geofence",
  graphqlHTTP({
    schema: schema,
    rootValue: root,
    graphiql: true,
  })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`GraphQL server listening on port ${PORT}`);
});

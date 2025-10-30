const express = require("express");
const { graphqlHTTP } = require("express-graphql");
const { buildSchema } = require("graphql");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

const INGRESS_API_KEY = process.env.API_KEY;
const BASE_URL = process.env.BASE_URL;

// Middleware for API Key verification
app.use("/circular-geofence", (req, res, next) => {
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
    getGeoFences(systemId: String!): GeoFenceResponse
  }

  type Mutation {
    createGeofence(name: String!, radius: Int!, coordinates: [[Float!]!]!, systemId: String!, notification: Int!): AggregateGeofenceResponse
    updateGeofence(geoId: String!, name: String!, radius: Int!, coordinates: [[Float!]!]!): API1Response
    deleteGeofence(geoId: String!): DeleteGeofenceResponse
  }

  type GeoFenceResponse {
   responseData: GeoFenceResponseData
    message: String
  }

  type GeoFenceResponseData {
    geofences: [GeofenceMapping]
    offset: Int
    limit: Int
    totalRecords: Int
  }

  type GeofenceMapping {
    id: String
    schedule: String
    notification: Int
    isEdgeEnabled: Int
    ruleId: Int
    isActive: Boolean
    ruleExpression: String
    name: String
    geofenceStatus: String
    isAssociated: Boolean
    geofence: Geofence
  }

  type Geofence {
    geoId: String
    name: String
    geometryType: String
    radius: Float
    coordinates: [[Float!]]
    isActive: Boolean
    tolerance: Float
    type: String
    poiFlag: Boolean
    vehicleStatus: String
    tag: String
  }

  type API1Response {
    responseData: API1ResponseData
    message: String
  }

  type API1ResponseData {
    geoId: String
  }

  type API2Response {
    geofenceMappings: [API2GeofenceMapping]
  }

  type API2GeofenceMapping {
    systemId: String
    vehicleMappingId: String
    message: String
  }

  type AggregateGeofenceResponse {
    api1: API1Response
    api2: API2Response
    message: String
  }

  type DeleteGeofenceResponse {
    message: String
  }
`);

// GraphQL resolver
const root = {
createGeofence: async ({ name, radius, coordinates, systemId, notification}) => {
    try {
      // Check if geofence already exists
      const getGeoFencesResponse = await axios.get(
        `${BASE_URL}/location/vehicles/${systemId}/geo-fences?offset=1&limit=10&isActive=true`,
        {
          headers: {
            accept:
              "application/com.c2c.telemetry.location.dto.v1.response.vehiclelocationresponse.v1+json",
            "api-key": "dGVsZW1ldHJ5LWdlb2ZlbmNlQDc4OQ",
            "x-requestor": "test",
          },
        }
      );

      if (getGeoFencesResponse.status === 200 && getGeoFencesResponse.data?.responseData?.geofences?.length > 0) {
        const existingGeofence = getGeoFencesResponse.data.responseData.geofences[0];
        const geoId = existingGeofence.geofence.geoId;
        return {
          api1: {
            responseData: {
              geoId: geoId
            },
            message: "Data Fetched Successfully"
          },
          api2: null,
          message: `Geofence already exists for this systemId. GeoId: ${geoId}`,
        };
      }

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
            "api-key": "dGVsZW1ldHJ5LWdlb2ZlbmNlQDc4OQ",
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
            "api-key": "dGVsZW1ldHJ5LWdlb2ZlbmNlQDc4OQ",
            "x-requestor": "test",
            "Content-Type":
              "application/com.c2c.telemetry.location.dto.v1.request.addtelemetrylocationdetailsrequestnew.v1+json",
          },
        }
      );

      const api2GeofenceMappings = api2Response.data?.geofenceMappings?.map(mapping => ({
        systemId: mapping.systemId,
        vehicleMappingId: mapping.vehicleMappingId,
        message: mapping.message,
      }));

      return {
        api1: api1Response.data,
        api2: { geofenceMappings: api2GeofenceMappings },
      };
    } catch (error) {
      console.error("Error in aggregateGeofence:", error);
      return {
        message: error.message || "An error occurred",
      };
    }
  },
  getGeoFences: async ({ systemId }) => {
    try {
      const response = await axios.get(`${BASE_URL}/location/vehicles/${systemId}/geo-fences`, {
        headers: {
          "accept": "application/com.c2c.telemetry.location.dto.v1.response.vehiclelocationresponse.v1+json",
          "api-key": "dGVsZW1ldHJ5LWdlb2ZlbmNlQDc4OQ",
          "x-requestor": "test"
        }
      });

      return response.data;
    } catch (error) {
      console.error("Error in getGeoFences:", error);
      return {
        message: error.message || "An error occurred",
      };
    }
  },
    updateGeofence: async ({ geoId, name, radius, coordinates}) => {
    try {
      // Construct payload for API 1
      const api1Payload = {
        name: name,
        geometryType: "circle",
        radius: radius,
        coordinates: coordinates,
        isActive: true,
        tolerance: 0,
        type: "personal",
        isPOI: true,
        tag: "Office"
      };

      // Call API 1
      const api1Response = await axios.put(
        `${BASE_URL}/location/locations/${geoId}`,
        api1Payload,
        {
          headers: {
            "accept": "application/com.c2c.telemetry.location.dto.v1.response.locationresponse.v1+json",
            "api-key": "dGVsZW1ldHJ5LWdlb2ZlbmNlQDc4OQ",
            "x-requestor": "test",
            "Content-Type": "application/com.c2c.telemetry.location.dto.v1.request.locationrequestnew.v1+json"
          }
        }
      );

      return api1Response.data;
    } catch (error) {
      console.error("Error in updateGeofence:", error);
      return {
        message: error.message || "An error occurred",
      };
    }
  },
  deleteGeofence: async ({ geoId }) => {
    try {
      // Call API 1
      const api1Response = await axios.delete(
        `${BASE_URL}/location/locations/${geoId}?isPOI=true`,
        {
          headers: {
            "accept": "application/com.c2c.telemetry.location.dto.v1.response.locationresponsedata.v1+json",
            "api-key": "dGVsZW1ldHJ5LWdlb2ZlbmNlQDc4OQ",
            "x-requestor": "test"
          }
        }
      );

      return { message: api1Response.data.message };
    } catch (error) {
      console.error("Error in deleteGeofence:", error);
      return {
        message: error.message || "An error occurred",
      };
    }
  }
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
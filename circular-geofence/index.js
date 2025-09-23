const express = require("express");
const { graphqlHTTP } = require("express-graphql");
const { buildSchema } = require("graphql");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

const INGRESS_API_KEY = process.env.API_KEY;

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
    aggregateGeofence(name: String!, radius: Int!, coordinates: [[Float!]!]!, systemId: String!, notification: Int!): CombinedResponse
    getGeoFences(systemId: String!): GeoFenceResponse
  }

  type Mutation {
    updateGeofence(geoId: String!, name: String!, radius: Int!, coordinates: [[Float!]!]!): API1Response
    deleteGeofence(geoId: String!): String
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
    systemId: String
    vehicleMappingId: String
    message: String
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
    geofenceMappings: [GeofenceMapping]
  }

  type CombinedResponse {
    api1: API1Response
    api2: API2Response
  }
`);

// GraphQL resolver
const root = {
  aggregateGeofence: async ({ name, radius, coordinates, systemId, notification }) => {
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
    const api1Response = await axios.post(
      "https://cbp-eu-uat.royalenfield.com/location/locations",
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

    const geoId = api1Response.data?.responseData?.geoId;

    if (!geoId) {
      throw new Error("Failed to retrieve geoId from API 1 response");
    }

    // Construct payload for API 2
    const api2Payload = {
      mapping: [
        {
          schedule: {},
          notification: notification,
          isEdgeEnabled: 0,
          ruleId: 0,
          isActive: true,
          ruleExpression: "string",
          name: name,
          systemId: systemId
        }
      ]
    };

    // Call API 2
    const api2Response = await axios.post(
      `https://cbp-eu-uat.royalenfield.com/location/vehicles/geo-fences/${geoId}`,
      api2Payload,
      {
        headers: {
          "accept": "application/com.c2c.telemetry.location.dto.v1.response.vehiclelocationresponse.v1+json",
          "api-key": "dGVsZW1ldHJ5LWdlb2ZlbmNlQDc4OQ",
          "x-requestor": "test",
          "Content-Type": "application/com.c2c.telemetry.location.dto.v1.request.addtelemetrylocationdetailsrequestnew.v1+json"
        }
      }
    );

    // Combine responses
    const combinedResponse = {
      api1: api1Response.data,
      api2: api2Response.data
    };

    return combinedResponse;
  },
  getGeoFences: async ({ systemId }) => {
    // Call the fetch geo-fences API
    const response = await axios.get(`https://cbp-eu-uat.royalenfield.com/location/vehicles/${systemId}/geo-fences?offset=1&limit=10&isActive=true`, {
      headers: {
        "accept": "application/com.c2c.telemetry.location.dto.v1.response.vehiclelocationresponse.v1+json",
        "api-key": "dGVsZW1ldHJ5LWdlb2ZlbmNlQDc4OQ",
        "x-requestor": "test"
      }
    });

    return response.data;
  },
  updateGeofence: async ({ geoId, name, radius, coordinates }) => {
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
      `https://cbp-eu-uat.royalenfield.com/location/locations/${geoId}`,
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
  },
  deleteGeofence: async ({ geoId }) => {
    // Call API 1
    const api1Response = await axios.delete(
      `https://cbp-eu-uat.royalenfield.com/location/locations/${geoId}?isPOI=true`,
      {
        headers: {
          "accept": "application/com.c2c.telemetry.location.dto.v1.response.locationresponsedata.v1+json",
          "api-key": "dGVsZW1ldHJ5LWdlb2ZlbmNlQDc4OQ",
          "x-requestor": "test"
        }
      }
    );

    return "Geofence deleted successfully";
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
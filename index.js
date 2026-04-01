const express = require("express");
const { graphqlHTTP } = require("express-graphql");
const { buildSchema, GraphQLScalarType, Kind } = require("graphql");
const axios = require("axios");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const INGRESS_API_KEY = process.env.API_KEY || "dashboard-api-key";
const PORT = process.env.PORT || 4010;
const BASE_URL = process.env.BASE_URL;
const GEOFENCE_API_KEY = process.env.GEOFENCE_API_KEY;
const TRIP_EVENTS_SUMMARY_API_KEY = process.env.TRIP_EVENTS_SUMMARY_API_KEY;
const COMPOSITE_API_URL = process.env.COMPOSITE_API_URL;
const COMPOSITE_API_KEY = process.env.COMPOSITE_API_KEY;
const LAST_PARKED_API_KEY = process.env.LAST_PARKED_API_KEY;
const schema = buildSchema(`
  scalar Long
  scalar JSON

  type TripLocation {
    longitude: Float
    latitude: Float
    altitude: Float
  }

  type TripDTO {
    tripId: String
    systemId: String
    modelCode: String
    tripStatus: String
    tripStartDate: Long
    tripEndDate: Long
    tripDuration: Float
    distance: Float
    runningTime: Float
    idlingTime: Float
    overspeedCount: Int
    averageSpeed: Float
    topSpeed: Float
    harshBreakers: Int
    harshAcceleration: Int
    navigation: String
    mergeId: String
    driverId: String
    fleetId: String
    tripFuelEfficiency: Float
    fuelConsumed: Float
    batteryConsumed: Float
    tripBatteryEfficiency: Float
    tripType: String
    trips: [String]
    tripStartLoc: TripLocation
    tripEndLoc: TripLocation
  }

  type TripReplayPlotPoint {
    time: Long
    longitude: Float
    latitude: Float
    direction: Float
    altitude: Float
  }

  type TripReplayAlerts {
    harshBreaks: [TripReplayPlotPoint]
    harshAcceleration: [TripReplayPlotPoint]
    overSpeed: [TripReplayPlotPoint]
  }

  type TripReplayResponseDTO {
    tripId: String
    plotPoints: [TripReplayPlotPoint]
    alerts: TripReplayAlerts
  }

  type TripListResponseDTO {
    offset: Int
    limit: Int
    totalRecords: Int
    message: String
    tripList: [TripDTO]
  }

  type TripReplayResponseWithPaginationDTO {
    offset: Int
    limit: Int
    totalRecords: Int
    message: String
    tripId: String
    plotPoints: [TripReplayPlotPoint]
    alerts: TripReplayAlerts
  }

  input MergeGroupInput {
    mergeId: String
    tripId: [String!]!
  }

  type Mutation {
    mergeUnmergeTrips(action: String!, systemId: String!, mergeGroups: [MergeGroupInput!]!): JSON
    createGeofence(name: String!, radius: Int!, coordinates: [[Float!]!]!, systemId: String!, notification: Int!): JSON
    updateGeofence(geoId: String!, name: String!, radius: Int!, coordinates: [[Float!]!]!, systemId: String!, notification: Int!): JSON
    deleteGeofence(geoId: String!): JSON
    enabledisableGeofence(systemId: String!, geoId: String!, action: String!): JSON
  }

  type Query {
    getTripDetails(systemId: String!, startDate: Long, endDate: Long, offset: Int, limit: Int): TripListResponseDTO
    lastParkedLocation(systemId: String!): JSON
    getTripReplayDetails(systemId: String!, startDate: Long!, endDate: Long!, tripId: String, mergeId: String): TripReplayResponseDTO
    deleteTrip(systemId: String!, tripId: String!): JSON
    getTripDetailsWithAggregation(systemId: String!, startDate: Long!, endDate: Long!, offset: Int, limit: Int): TripListResponseDTO
    getTripReplayDetailsWithPagination(systemId: String!, startDate: Long!, endDate: Long!, tripId: String, mergeId: String, offset: Int, limit: Int): TripReplayResponseWithPaginationDTO
    getTripSummary(systemId: String!, startDate: Long!, endDate: Long!): JSON
    getGeoFences(systemId: String!): JSON
  }
`);

const LongScalar = new GraphQLScalarType({
  name: "Long",
  description: "Custom scalar type for 64-bit integers",
  serialize(value) {
    return value != null ? value.toString() : null;
  },
  parseValue(value) {
    if (typeof value === "string" || typeof value === "number") {
      return value;
    }
    return null;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.INT || ast.kind === Kind.STRING) {
      return ast.value;
    }
    return null;
  },
});

const root = {
  mergeUnmergeTrips: async ({ action, systemId, mergeGroups }) => {
    try {
      const url = `${BASE_URL}/asset-management/trips/merge-unmerge?action=${encodeURIComponent(action)}`;
      const response = await axios.put(
        url,
        { systemId, mergeGroups },
        {
          headers: {
            accept: "*/*",
            "x-requestor": "abc",
            "api-key": TRIP_EVENTS_SUMMARY_API_KEY,
            "Content-Type": "application/json",
          },
        },
      );
      return response.data;
    } catch (error) {
      return error.response?.data || { message: error.message };
    }
  },
  Long: LongScalar,
  getTripDetails: async ({ systemId, startDate, endDate, offset, limit }) => {
    try {
      const query = `query VehicleLocations($systemId: String!, $startDate: Long, $endDate: Long, $offset: Int, $limit: Int) {\n  getTripDetails(systemId: $systemId, startDate: $startDate, endDate: $endDate, offset: $offset, limit: $limit) {\n    offset\n    limit\n    totalRecords\n    message\n    tripList {\n      tripId\n      systemId\n      tripStatus\n      tripStartDate\n      tripEndDate\n      tripDuration\n      distance\n      runningTime\n      idlingTime\n      overspeedCount\n      averageSpeed\n      topSpeed\n      harshBreakers\n      harshAcceleration\n      navigation\n      mergeId\n      driverId\n      fleetId\n      tripFuelEfficiency\n      fuelConsumed\n      batteryConsumed\n      tripBatteryEfficiency\n      tripType\n      tripStartLoc {\n        longitude\n        latitude\n        altitude\n      }\n      tripEndLoc {\n        longitude\n        latitude\n        altitude\n      }\n    }\n  }\n}`;
      const variables = { systemId };
      if (startDate !== undefined) variables.startDate = startDate;
      if (endDate !== undefined) variables.endDate = endDate;
      if (offset !== undefined) variables.offset = offset;
      if (limit !== undefined) variables.limit = limit;
      const response = await axios.post(
        COMPOSITE_API_URL,
        { query, variables },
        {
          headers: {
            "Content-Type": "application/json",
            "api-key": COMPOSITE_API_KEY,
            "x-requestor": "test",
          },
        },
      );
      return response.data?.data?.getTripDetails || null;
    } catch (error) {
      return error.response?.data || { message: error.message };
    }
  },
  getTripDetailsWithAggregation: async ({
    systemId,
    startDate,
    endDate,
    offset,
    limit,
  }) => {
    try {
      const query = `query GetTripDetailsWithAggregation($systemId: String!, $startDate: Long!, $endDate: Long!, $offset: Int, $limit: Int) {\n  getTripDetailsWithAggregation(systemId: $systemId, startDate: $startDate, endDate: $endDate, offset: $offset, limit: $limit) {\n    offset\n    limit\n    totalRecords\n    message\n    tripList {\n      tripId\n      systemId\n      modelCode\n      tripStatus\n      tripStartDate\n      tripEndDate\n      tripDuration\n      distance\n      runningTime\n      idlingTime\n      overspeedCount\n      averageSpeed\n      topSpeed\n      harshBreakers\n      harshAcceleration\n      navigation\n      mergeId\n      driverId\n      fleetId\n      tripFuelEfficiency\n      fuelConsumed\n      batteryConsumed\n      tripBatteryEfficiency\n      tripType\n      trips\n      tripStartLoc {\n        longitude\n        latitude\n        altitude\n      }\n      tripEndLoc {\n        longitude\n        latitude\n        altitude\n      }\n    }\n  }\n}`;
      const variables = { systemId };
      if (startDate !== undefined) variables.startDate = startDate;
      if (endDate !== undefined) variables.endDate = endDate;
      if (offset !== undefined) variables.offset = offset;
      if (limit !== undefined) variables.limit = limit;
      
      console.log('getTripDetailsWithAggregation - Variables:', JSON.stringify(variables));
      
      const response = await axios.post(
        COMPOSITE_API_URL,
        { query, variables },
        {
          headers: {
            "Content-Type": "application/json",
            "api-key": COMPOSITE_API_KEY,
            "x-requestor": "test",
          },
        },
      );
      
      console.log('getTripDetailsWithAggregation - Response Status:', response.status);
      console.log('getTripDetailsWithAggregation - Response Data:', JSON.stringify(response.data, null, 2));
      
      if (response.data?.errors) {
        console.log('getTripDetailsWithAggregation - Errors found in base API response, but returning data anyway');
      }
      
      const result = response.data?.data?.getTripDetailsWithAggregation;
      console.log('getTripDetailsWithAggregation - Returning:', JSON.stringify(result, null, 2));
      return result || null;
    } catch (error) {
      console.error('getTripDetailsWithAggregation - Error:', error.message);
      if (error.response) {
        console.error('getTripDetailsWithAggregation - Error Response:', JSON.stringify(error.response.data, null, 2));
      }
      return error.response?.data || { message: error.message };
    }
  },
  getTripReplayDetailsWithPagination: async ({
    systemId,
    startDate,
    endDate,
    tripId,
    mergeId,
    offset,
    limit,
  }) => {
    try {
      const query = `query GetTripReplayDetailsWithPagination($systemId: String!, $startDate: Long!, $endDate: Long!, $tripId: String, $mergeId: String, $offset: Int, $limit: Int) {\n  getTripReplayDetailsWithPagination(systemId: $systemId, startDate: $startDate, endDate: $endDate, tripId: $tripId, mergeId: $mergeId, offset: $offset, limit: $limit) {\n    offset\n    limit\n    totalRecords\n    message\n    tripId\n    plotPoints {\n      time\n      longitude\n      latitude\n      direction\n      altitude\n    }\n    alerts {\n      harshBreaks {\n        time\n        longitude\n        latitude\n        direction\n        altitude\n      }\n      harshAcceleration {\n        time\n        longitude\n        latitude\n        direction\n        altitude\n      }\n      overSpeed {\n        time\n        longitude\n        latitude\n        direction\n        altitude\n      }\n    }\n  }\n}`;
      const variables = { systemId, startDate, endDate };
      if (tripId !== undefined) variables.tripId = tripId;
      if (mergeId !== undefined) variables.mergeId = mergeId;
      if (offset !== undefined) variables.offset = offset;
      if (limit !== undefined) variables.limit = limit;
      const response = await axios.post(
        COMPOSITE_API_URL,
        { query, variables },
        {
          headers: {
            "Content-Type": "application/json",
            "api-key": COMPOSITE_API_KEY,
            "x-requestor": "test",
          },
        },
      );
      return response.data?.data?.getTripReplayDetailsWithPagination || null;
    } catch (error) {
      return error.response?.data || { message: error.message };
    }
  },
  lastParkedLocation: async ({ systemId }) => {
    try {
      const url = `${BASE_URL}/telemetry-curr/vehicles/${systemId}/last-parked-location`;
      const response = await axios.get(url, {
        headers: {
          accept:
            "application/com.c2c.telemetry.dto.v1.telemetryresponse.v1+json",
          "x-requestor": "test",
          "api-key": LAST_PARKED_API_KEY,
        },
      });
      return response.data;
    } catch (error) {
      return error.response?.data || { message: error.message };
    }
  },
  getTripReplayDetails: async ({
    systemId,
    startDate,
    endDate,
    tripId,
    mergeId,
  }) => {
    try {
      const query = `query GetTripReplayDetails($systemId: String!, $startDate: Long!, $endDate: Long!, $tripId: String, $mergeId: String) {\n  getTripReplayDetails(systemId: $systemId, startDate: $startDate, endDate: $endDate, tripId: $tripId, mergeId: $mergeId) {\n    tripId\n    plotPoints {\n      time\n      longitude\n      latitude\n      direction\n      altitude\n    }\n    alerts {\n      harshBreaks {\n        time\n        longitude\n        latitude\n        direction\n        altitude\n      }\n      harshAcceleration {\n        time\n        longitude\n        latitude\n        direction\n        altitude\n      }\n      overSpeed {\n        time\n        longitude\n        latitude\n        direction\n        altitude\n      }\n    }\n  }\n}`;
      const variables = { systemId, startDate, endDate };
      if (tripId !== undefined) variables.tripId = tripId;
      if (mergeId !== undefined) variables.mergeId = mergeId;
      const response = await axios.post(
        COMPOSITE_API_URL,
        { query, variables },
        {
          headers: {
            "Content-Type": "application/json",
            "api-key": COMPOSITE_API_KEY,
            "x-requestor": "test",
          },
        },
      );
      return response.data?.data?.getTripReplayDetails || null;
    } catch (error) {
      return error.response?.data || { message: error.message };
    }
  },
  deleteTrip: async ({ systemId, tripId }) => {
    try {
      const query = `query DeleteTrip($systemId: String!, $tripId: String!) {\n  deleteTrip(systemId: $systemId, tripId: $tripId)\n}`;
      const variables = { systemId, tripId };
      const response = await axios.post(
        COMPOSITE_API_URL,
        { query, variables },
        {
          headers: {
            "Content-Type": "application/json",
            "api-key": COMPOSITE_API_KEY,
            "x-requestor": "test",
          },
        },
      );
      return response.data?.data?.deleteTrip || null;
    } catch (error) {
      return error.response?.data || { message: error.message };
    }
  },
  getTripSummary: async ({ systemId, startDate, endDate }) => {
    try {
      const url = `${BASE_URL}/asset-management/vehicle/${systemId}/usage?startDate=${startDate}&endDate=${endDate}`;
      const response = await axios.get(url, {
        headers: {
          "accept": "*/*",
          "x-requestor": "test",
          "api-key": TRIP_EVENTS_SUMMARY_API_KEY,
        },
      });
      return response.data;
    } catch (error) {
      return error.response?.data || { message: error.message };
    }
  },
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
      return error.response?.data || { message: error.message };
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
      const api1Response = await axios.put(`${BASE_URL}/location/locations/${geoId}`, api1Payload, {
        headers: {
          accept:
            "application/com.c2c.telemetry.location.dto.v1.response.locationresponse.v1+json",
          "api-key": GEOFENCE_API_KEY,
          "x-requestor": "test",
          "Content-Type":
            "application/com.c2c.telemetry.location.dto.v1.request.locationrequestnew.v1+json",
        },
      });

      // Wait for 2 seconds after successful API 1 response
      if (api1Response.status === 200) {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 2-second delay
      }

      // API 2 notification update
      const api2Payload = 
          {
            schedule: {},
            notification,
            isEdgeEnabled: 1,
            ruleId: 0,
            isActive: true,
            ruleExpression: "string",
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
              "application/com.c2c.telemetry.location.dto.v1.request.telemetrylocationdetailsrequestnew.v1+json",
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

app.use(
  "/reapp",
  (req, res, next) => {
    const apiKey = req.headers["x-api-key"];
    const xEnv = req.headers["x-environment"];
    if (!apiKey || apiKey !== INGRESS_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!xEnv) {
      return res
        .status(400)
        .json({ error: "Bad Request: Missing x-environment header" });
    }
    next();
  },
  graphqlHTTP({
    schema: schema,
    rootValue: root,
    graphiql: true,
    customFormatErrorFn: (err) => {
      return {
        message: err.message,
        locations: err.locations,
        path: err.path,
      };
    },
  }),
);

app.listen(PORT, () => {
  console.log(`Trip Summary GraphQL server listening on port ${PORT}`);
});

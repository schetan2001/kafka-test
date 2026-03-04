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
  }

  type Query {
    getTripDetails(systemId: String!, startDate: Long, endDate: Long, offset: Int, limit: Int): TripListResponseDTO
    lastParkedLocation(systemId: String!): JSON
    getTripReplayDetails(systemId: String!, startDate: Long!, endDate: Long!, tripId: String, mergeId: String): TripReplayResponseDTO
    deleteTrip(systemId: String!, tripId: String!): String
    mergeTrips(systemId: String!, tripIds: [String!]!): String
    getTripDetailsWithAggregation(systemId: String!, startDate: Long, endDate: Long, offset: Int, limit: Int): TripListResponseDTO
    getTripReplayDetailsWithPagination(systemId: String!, startDate: Long!, endDate: Long!, tripId: String, mergeId: String, offset: Int, limit: Int): TripReplayResponseWithPaginationDTO
  }
`);

// Custom Long scalar implementation
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
      const url = `https://cbp-in-uat.royalenfield.com/asset-management/trips/merge-unmerge?action=${encodeURIComponent(action)}`;
      const response = await axios.put(
        url,
        { systemId, mergeGroups },
        {
          headers: {
            accept: "*/*",
            "x-requestor": "abc",
            "api-key": process.env.MERGE_UNMERGE_API_KEY,
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
        process.env.TRIP_GRAPHQL_URL,
        { query, variables },
        {
          headers: {
            "Content-Type": "application/json",
            "api-key": process.env.TRIP_GRAPHQL_API_KEY,
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
      const query = `query GetTripDetailsWithAggregation($systemId: String!, $startDate: Long, $endDate: Long, $offset: Int, $limit: Int) {\n  getTripDetailsWithAggregation(systemId: $systemId, startDate: $startDate, endDate: $endDate, offset: $offset, limit: $limit) {\n    offset\n    limit\n    totalRecords\n    message\n    tripList {\n      tripId\n      systemId\n      tripStatus\n      tripStartDate\n      tripEndDate\n      tripDuration\n      distance\n      runningTime\n      idlingTime\n      overspeedCount\n      averageSpeed\n      topSpeed\n      harshBreakers\n      harshAcceleration\n      navigation\n      mergeId\n      driverId\n      fleetId\n      tripFuelEfficiency\n      fuelConsumed\n      batteryConsumed\n      tripBatteryEfficiency\n      tripType\n      tripStartLoc {\n        longitude\n        latitude\n        altitude\n      }\n      tripEndLoc {\n        longitude\n        latitude\n        altitude\n      }\n    }\n  }\n}`;
      const variables = { systemId };
      if (startDate !== undefined) variables.startDate = startDate;
      if (endDate !== undefined) variables.endDate = endDate;
      if (offset !== undefined) variables.offset = offset;
      if (limit !== undefined) variables.limit = limit;
      const response = await axios.post(
        process.env.TRIP_GRAPHQL_URL,
        { query, variables },
        {
          headers: {
            "Content-Type": "application/json",
            "api-key": process.env.TRIP_GRAPHQL_API_KEY,
            "x-requestor": "test",
          },
        },
      );
      return response.data?.data?.getTripDetailsWithAggregation || null;
    } catch (error) {
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
        process.env.TRIP_GRAPHQL_URL,
        { query, variables },
        {
          headers: {
            "Content-Type": "application/json",
            "api-key": process.env.TRIP_GRAPHQL_API_KEY,
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
      const url = `${process.env.BASE_URL}/telemetry-curr/vehicles/${systemId}/last-parked-location`;
      const response = await axios.get(url, {
        headers: {
          accept:
            "application/com.c2c.telemetry.dto.v1.telemetryresponse.v1+json",
          "x-requestor": "test",
          "api-key": process.env.LAST_PARKED_API_KEY,
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
        process.env.TRIP_GRAPHQL_URL,
        { query, variables },
        {
          headers: {
            "Content-Type": "application/json",
            "api-key": process.env.TRIP_GRAPHQL_API_KEY,
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
      const query = `mutation DeleteTrip($systemId: String!, $tripId: String!) {\n  deleteTrip(systemId: $systemId, tripId: $tripId)\n}`;
      const variables = { systemId, tripId };
      const response = await axios.post(
        process.env.TRIP_GRAPHQL_URL,
        { query, variables },
        {
          headers: {
            "Content-Type": "application/json",
            "api-key": process.env.TRIP_GRAPHQL_API_KEY,
            "x-requestor": "test",
          },
        },
      );
      return response.data?.data?.deleteTrip || null;
    } catch (error) {
      return error.response?.data || { message: error.message };
    }
  },
  mergeTrips: async ({ systemId, tripIds }) => {
    try {
      const query = `mutation MergeTrips($systemId: String!, $tripIds: [String!]!) {\n  mergeTrips(systemId: $systemId, tripIds: $tripIds)\n}`;
      const variables = { systemId, tripIds };
      const response = await axios.post(
        process.env.TRIP_GRAPHQL_URL,
        { query, variables },
        {
          headers: {
            "Content-Type": "application/json",
            "api-key": process.env.TRIP_GRAPHQL_API_KEY,
            "x-requestor": "test",
          },
        },
      );
      return response.data?.data?.mergeTrips || null;
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

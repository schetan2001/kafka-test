require("dotenv").config();
const express = require("express");
const { ApolloServer } = require("apollo-server-express");
const { PubSub } = require("graphql-subscriptions");
const { Kafka } = require("kafkajs");
const http = require("http");
const cors = require("cors");

const KAFKA_BROKER = process.env.KAFKA_BROKER;
const INPUT_TOPIC = process.env.INPUT_TOPIC;
const PORT = Number(process.env.PORT || 4002);
const KAFKA_GROUP_ID = process.env.KAFKA_GROUP_ID || "graphql-subscription-group";

if (!KAFKA_BROKER || !INPUT_TOPIC) {
  console.error("Missing required environment variables: KAFKA_BROKER, INPUT_TOPIC");
  process.exit(1);
}

const pubsub = new PubSub();
const VEHICLE_TELEMETRY_UPDATED = "VEHICLE_TELEMETRY_UPDATED";

// Event types to filter
const ALLOWED_EVENT_TYPES = [6500, 6501, 3101];

// GraphQL Type Definitions
const typeDefs = `
  type Subscription {
    vehicleTelemetryUpdated(systemId: String!): VehicleTelemetry
  }

  type VehicleTelemetry {
    systemId: String!
    timestamp: String!
    ignitionStatus: String
    hillHold: String
    cruiseControlStatus: String
    tractionControl: String
    regenSetting: String
    sideStandStatus: String
    gpsSignalStrength: String
    liveOdo: String
    trip1Odo: String
    trip2Odo: String
    slcOdo: String
    odometer: String
    lteConnStatus: String
    lteSignalStrength: String
    trip1DurationHrs: String
    trip1DurationMins: String
    trip1MaxSpeed: String
    trip1AvgSpeed: String
    trip1AvgEff: String
    trip1TotalEnergyConsump: String
    trip2DurationHrs: String
    trip2DurationMins: String
    trip2AvgEff: String
    trip2TotalEnergyConsump: String
    trip2MaxSpeed: String
    trip2AvgSpeed: String
    slcMaxSpeed: String
    slcAvgSpeed: String
    slcAvgEff: String
    slcTotalEnergyConsump: String
    slcDurationMins: String
    liveDurationHrs: String
    liveDurationMins: String
    liveMaxSpeed: String
    liveAvgSpeed: String
    liveAvgEff: String
    liveTotalEnergyConsump: String
    trip1ResetFlag: String
    trip2ResetFlag: String
    latitude: String
    latitudeDirection: String
    longitude: String
    longitudeDirection: String
    gpsStatus: String
    gpsFixValue: String
    rideMode: String
    absState: String
    chargingMode: String
    vehicleRange: String
    conservativeRange: String
    averageRange: String
    aggressiveRange: String
    rangeGain: String
    batterySoc: String
    chargingStatus: String
    vehicleStatus: String
    lockStatus: String
    timeToChargeHrs: String
    timeToChargeMins: String
    absSensitivity: String
    powerOutputControl: String
    throttleMapControl: String
    regenCoastControl: String
    regenBrakeControl: String
    batteryTempMin: String
    batteryTempMax: String
    frontPressureLvl: String
    rearPressureLvl: String
    frontTempLvl: String
    rearTempLvl: String
    frontBatteryLvl: String
    rearBatteryLvl: String
  }
`;

// Helper function to extract value by property ID
const extractValueById = (data, propertyId) => {
  const item = data?.find((d) => d.id === propertyId);
  return item ? String(Array.isArray(item.value) ? item.value[0] : item.value) : null;
};

// Helper function to calculate LTE signal strength
const getSignalStrength = (data) => {
  const rsrp = parseFloat(extractValueById(data, 554745880));
  const rsrq = parseFloat(extractValueById(data, 554745881));

  if (isNaN(rsrp) || isNaN(rsrq)) return null;

  const levels = ["Poor", "Fair", "Good", "Excellent"];

  let rsrpLevel =
    rsrp >= -85 ? "Excellent" : rsrp >= -95 ? "Good" : rsrp >= -105 ? "Fair" : "Poor";
  let rsrqLevel =
    rsrq >= -10 ? "Excellent" : rsrq >= -12 ? "Good" : rsrq >= -15 ? "Fair" : "Poor";

  const finalIndex = Math.min(levels.indexOf(rsrpLevel), levels.indexOf(rsrqLevel));
  return levels[finalIndex];
};

// Helper function to get charging status
const getChargingStatus = (data) => {
  const modeLvl1 = extractValueById(data, 557875295);
  if (modeLvl1 === "5") {
    const modeLvl2 = extractValueById(data, 557875296);
    if (modeLvl2 === "15") return "Fast Charging";
    if (modeLvl2 === "16") return "Slow Charging";
  }
  return "Not Charging";
};

// Helper function to get vehicle status
const getVehicleStatus = (data) => {
  const modeLvl1 = extractValueById(data, 557875295);
  if (modeLvl1 === "4") return "Riding";

  const modeLvl3 = extractValueById(data, 557875297);
  if (["1", "4", "6"].includes(modeLvl3)) return "Locked";

  const modeLvl2 = extractValueById(data, 557875296);
  if (modeLvl2 === "12") return "Parked";

  return "Unlocked";
};

// Transform Kafka message to GraphQL format
const transformTelemetryData = (payload) => {
  const systemId = payload?.meta?.system_id;
  if (!systemId) return null;

  const telemetryEntry = payload?.telemetry?.[0];
  if (!telemetryEntry?.data) return null;

  const eventType = telemetryEntry.event_type;
  
  // Filter by allowed event types
  if (!ALLOWED_EVENT_TYPES.includes(eventType)) return null;

  const data = telemetryEntry.data;

  return {
    systemId,
    timestamp: telemetryEntry.time,
    ignitionStatus: extractValueById(data, 557875730),
    hillHold: extractValueById(data, 557875293),
    cruiseControlStatus: extractValueById(data, 557875291),
    tractionControl: extractValueById(data, 557876108),
    regenSetting: extractValueById(data, 557875813),
    sideStandStatus: extractValueById(data, 557875284),
    gpsSignalStrength: extractValueById(data, 554745871),
    liveOdo: extractValueById(data, 559972924),
    trip1Odo: extractValueById(data, 559972897),
    trip2Odo: extractValueById(data, 559972898),
    slcOdo: extractValueById(data, 559972896),
    odometer: extractValueById(data, 557875743),
    lteConnStatus: extractValueById(data, 557876137),
    lteSignalStrength: getSignalStrength(data),
    trip1DurationHrs: extractValueById(data, 557875760),
    trip1DurationMins: extractValueById(data, 557875761),
    trip1MaxSpeed: extractValueById(data, 557875747),
    trip1AvgSpeed: extractValueById(data, 557875748),
    trip1AvgEff: extractValueById(data, 559972901),
    trip1TotalEnergyConsump: extractValueById(data, 559972902),
    trip2DurationHrs: extractValueById(data, 557875762),
    trip2DurationMins: extractValueById(data, 557875763),
    trip2AvgEff: extractValueById(data, 559972905),
    trip2TotalEnergyConsump: extractValueById(data, 559972906),
    trip2MaxSpeed: extractValueById(data, 557875751),
    trip2AvgSpeed: extractValueById(data, 557875752),
    slcMaxSpeed: extractValueById(data, 557875755),
    slcAvgSpeed: extractValueById(data, 557875756),
    slcAvgEff: extractValueById(data, 559972909),
    slcTotalEnergyConsump: extractValueById(data, 559972910),
    slcDurationMins: extractValueById(data, 557875759),
    liveDurationHrs: extractValueById(data, 557875765),
    liveDurationMins: extractValueById(data, 557875766),
    liveMaxSpeed: extractValueById(data, 557875767),
    liveAvgSpeed: extractValueById(data, 557875768),
    liveAvgEff: extractValueById(data, 559972921),
    liveTotalEnergyConsump: extractValueById(data, 559972922),
    trip1ResetFlag: extractValueById(data, 557875826),
    trip2ResetFlag: extractValueById(data, 557875827),
    latitude: extractValueById(data, 559940097),
    latitudeDirection: extractValueById(data, 554745874),
    longitude: extractValueById(data, 559940098),
    longitudeDirection: extractValueById(data, 554745875),
    gpsStatus: extractValueById(data, 554745870),
    gpsFixValue: extractValueById(data, 559988762),
    rideMode: extractValueById(data, 557876215),
    absState: extractValueById(data, 557875822),
    chargingMode: extractValueById(data, 557875426),
    vehicleRange: extractValueById(data, 557876214),
    conservativeRange: extractValueById(data, 557876211),
    averageRange: extractValueById(data, 557876212),
    aggressiveRange: extractValueById(data, 557876213),
    rangeGain: extractValueById(data, 557876282),
    batterySoc: extractValueById(data, 557876173),
    chargingStatus: getChargingStatus(data),
    vehicleStatus: getVehicleStatus(data),
    lockStatus: extractValueById(data, 557875729),
    timeToChargeHrs: extractValueById(data, 557876079),
    timeToChargeMins: extractValueById(data, 557876080),
    absSensitivity: extractValueById(data, 557875823),
    powerOutputControl: extractValueById(data, 557876109),
    throttleMapControl: extractValueById(data, 557876269),
    regenCoastControl: extractValueById(data, 557876111),
    regenBrakeControl: extractValueById(data, 557876112),
    batteryTempMin: extractValueById(data, 559972690),
    batteryTempMax: extractValueById(data, 559972691),
    frontPressureLvl: extractValueById(data, 826314763),
    rearPressureLvl: extractValueById(data, 826314764),
    frontTempLvl: extractValueById(data, 826314765),
    rearTempLvl: extractValueById(data, 826314766),
    frontBatteryLvl: extractValueById(data, 826314761),
    rearBatteryLvl: extractValueById(data, 826314762),
  };
};

// GraphQL Resolvers
const resolvers = {
  Subscription: {
    vehicleTelemetryUpdated: {
      subscribe: (_, { systemId }) => {
        console.log(`New subscription for systemId: ${systemId}`);
        return pubsub.asyncIterator([`${VEHICLE_TELEMETRY_UPDATED}_${systemId}`]);
      },
    },
  },
};

// Kafka Consumer Setup
const kafka = new Kafka({
  clientId: "graphql-subscription-service",
  brokers: [KAFKA_BROKER],
});

const consumer = kafka.consumer({ groupId: KAFKA_GROUP_ID });

async function startKafkaConsumer() {
  try {
    await consumer.connect();
    console.log("Kafka consumer connected");

    await consumer.subscribe({ topic: INPUT_TOPIC, fromBeginning: false });
    console.log(`Subscribed to topic: ${INPUT_TOPIC}`);

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const payload = JSON.parse(message.value.toString());
          const telemetryData = transformTelemetryData(payload);

          if (telemetryData) {
            // Publish to specific systemId channel
            pubsub.publish(`${VEHICLE_TELEMETRY_UPDATED}_${telemetryData.systemId}`, {
              vehicleTelemetryUpdated: telemetryData,
            });
            console.log(`Published telemetry for systemId: ${telemetryData.systemId}`);
          }
        } catch (error) {
          console.error("Error processing Kafka message:", error);
        }
      },
    });
  } catch (error) {
    console.error("Failed to start Kafka consumer:", error.message);
  }
}

// Apollo Server Setup
async function startApolloServer() {
  const app = express();
  app.use(cors());

  const httpServer = http.createServer(app);

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    plugins: [
      {
        async serverWillStart() {
          return {
            async drainServer() {
              // Cleanup on shutdown
            },
          };
        },
      },
    ],
  });

  await server.start();
  server.applyMiddleware({ app, path: "/graphql" });

  httpServer.listen(PORT, () => {
    console.log(`🚀 GraphQL Subscription Server ready at ${PORT}${server.graphqlPath}`);
    console.log(`📡 WebSocket endpoint: ${PORT}${server.graphqlPath}`);
  });
}

// Start both servers
(async () => {
  await startKafkaConsumer();
  await startApolloServer();
})();
const express = require("express");
const { graphqlHTTP } = require("express-graphql");
const { buildSchema } = require("graphql");
const axios = require("axios");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const app = express();
app.use(express.json());

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

const INGRESS_API_KEY = process.env.API_KEY || "dashboard-api-key";
const BASE_URL = process.env.BASE_URL || "https://cbp-eu-uat.royalenfield.com";
const COTA_API_KEY = process.env.COTA_API_KEY;
const STATE_API_KEY = process.env.STATE_API_KEY;
const TELEMETRY_API_KEY = process.env.TELEMETRY_API_KEY;
const CCSERVICE_API_KEY = process.env.CCSERVICE_API_KEY;
const VEHICLE_METADATA_API_KEY = process.env.VEHICLE_METADATA_API_KEY;
const VEHICLE_HEALTH_API_KEY = process.env.VEHICLE_HEALTH_API_KEY;
const CAMPAIGN_API_KEY= process.env.CAMPAIGN_API_KEY;

// GraphQL schema
const schema = buildSchema(`
  type Query {
    getVehicleStatuses(systemId: String!): VehicleStatusesResponse
    getLockUnlockTracking(trackingId: String!): JSON
    getVehicleRideModeTracking(trackingId: String!): JSON
    getLastParkedLocation(systemId: String!): JSON
    getVehicleMetadata(systemId: String!): VehicleMetadataResponse
    getVehicleHealthStatus(systemId: String!): VehicleHealthStatusResponse
    getCampaignVersions(systemId: String!): CampaignVersionResponse
  }

  type Mutation {
    updateLockUnlock(systemId: String!, name: String!, value: Int!): JSON
    updateRideMode(systemId: String!, mode: String!): JSON
    updateCustomMode(systemId: String!, settings: CustomModeSettingsInput!): JSON
    updateVehicleMode(systemId: String!, mode: String!, enabled: Boolean!, startTime: Float, endTime: Float): JSON
  }

  input CustomModeSettingsInput {
    anti_lock_brakes: String
    traction_control: String
    power_output: String
    torque_map: String
    regen_coast: String
    regen_braking: String
  }

  scalar JSON

  type VehicleStatusesResponse {
    ignition: String
    lastHeartBeatTime: String
    currentState: String
    connectionState: String
    gpsFix: String
    vehicleMode: String
    speed: String
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
    updatedTime: String
  }

  type SignalValue {
    name: String
    value: String
  }

  type CommandResponse {
    status: String
    trackingId: String
    message: String
  }

  type VehicleMetadataResponse {
    systemId: String
    model: String
  }

  type VehicleHealthStatusResponse {
    vehicleStatus: String
    batteryHealth: String
    motorHealth: String
    mcuHealth: String
  }

  type CampaignVersionResponse {
    currentVersion: String
    targetVersion: String
    timestamp: Float
  }
`);

// Helper function to extract signal value
const extractSignalValue = (signals, signalName, eventType = null) => {
  // OBD Critical Packet for vehicle mode signals
  const vehicleModeSignals = [
    "Vehicle_Mode__Vehicle_Mode_Lvl_1_RX_V",
    "Vehicle_Mode__Vehicle_Mode_Lvl_2_RX_V",
    "Vehicle_Mode__Vehicle_Mode_Lvl_3_RX_V",
  ];

  const signal = signals?.find((s) => {
    if (s.name !== signalName) {
      return false;
    }
    if (eventType) {
      return s.eventType === eventType;
    }
    return vehicleModeSignals.includes(signalName)
      ? s.eventType === 6500
      : !signalName.startsWith("AL_") || s.eventType === 3101;
  });

  return signal ? signal.value : null;
};

const getSignalStrength = (signals) => {
  const rsrp = parseFloat(extractSignalValue(signals, "AL_RSRP", 3101));
  const rsrq = parseFloat(extractSignalValue(signals, "AL_RSRQ", 3101));

  if (isNaN(rsrp) || isNaN(rsrq)) return null;

  const levels = ["Poor", "Fair", "Good", "Excellent"];

  let rsrpLevel =
    rsrp >= -85
      ? "Excellent"
      : rsrp >= -95
      ? "Good"
      : rsrp >= -105
      ? "Fair"
      : "Poor";

  let rsrqLevel =
    rsrq >= -10
      ? "Excellent"
      : rsrq >= -12
      ? "Good"
      : rsrq >= -15
      ? "Fair"
      : "Poor";

  // Taking weaker of the two for final signal strength
  const finalIndex = Math.min(
    levels.indexOf(rsrpLevel),
    levels.indexOf(rsrqLevel)
  );
  return levels[finalIndex];
};

const getChargingStatus = (signals) => {
  const modeLvl1 = extractSignalValue(
    signals,
    "Vehicle_Mode__Vehicle_Mode_Lvl_1_RX_V", 6500
  );

  if (modeLvl1 === "5") {
    const modeLvl2 = extractSignalValue(
      signals,
      "Vehicle_Mode__Vehicle_Mode_Lvl_2_RX_V", 6500
    );

    if (modeLvl2 === "15") return "Fast Charging";
    if (modeLvl2 === "16") return "Slow Charging";
  }

  return "Not Charging";
};

const getVehicleStatus = (signals) => {
  const modeLvl1 = extractSignalValue(
    signals,
    "Vehicle_Mode__Vehicle_Mode_Lvl_1_RX_V", 6500
  );

  // First check if vehicle is riding
  if (modeLvl1 === "4") return "Riding";

  // If not riding, check lock status
  const modeLvl3 = extractSignalValue(
    signals,
    "Vehicle_Mode__Vehicle_Mode_Lvl_3_RX_V", 6500
  );

  if (["1", "4", "6"].includes(modeLvl3)) return "Locked";

  // If not locked, check parking status
  const modeLvl2 = extractSignalValue(
    signals,
    "Vehicle_Mode__Vehicle_Mode_Lvl_2_RX_V", 6500
  );
  if (modeLvl2 === "12") return "Parked";

  return "Unlocked";
};

// Resolver function for the query
const root = {
  getVehicleStatuses: async ({ systemId }) => {
    try {
      // Fetch both APIs in parallel
      const [stateResponse, telemetryResponse] = await Promise.all([
        axios.post(
          `${BASE_URL}/state-operation-service/state/vehicles`,
          [systemId],
          {
            headers: {
              "Content-Type": "application/json",
              "api-key": STATE_API_KEY,
              "x-requestor": "test",
            },
          }
        ),
        axios.get(
          `${BASE_URL}/telemetry-curr/current-value/${systemId}`,
          {
            headers: {
              accept: "*/*",
              "x-requestor": "test",
              "api-key": TELEMETRY_API_KEY,
            },
          }
        )
      ]);

      // Extract state data
      let stateData = {};
      if (stateResponse.data?.result?.[0]?.responseData) {
        const vehicleData = stateResponse.data.result[0].responseData.vehicleStateData;
        const lastHeartBeatTime = stateResponse.data.result[0].responseData.lastHeartBeatTime;
        stateData = {
          ignition: vehicleData.ignition,
          lastHeartBeatTime: String(lastHeartBeatTime),
          updatedTime: String(lastHeartBeatTime),
          currentState: vehicleData.currentState,
          connectionState: vehicleData.connectionState,
          gpsFix: vehicleData.gpsFix,
          vehicleMode: vehicleData.vehicleMode,
          speed: vehicleData.speed,
        };
      }

      // Extract telemetry data
      let telemetryData = {};
      if (telemetryResponse.data?.responseData?.signals) {
        const signals = telemetryResponse.data.responseData.signals;

        const event3101Signal = signals.find(
          (signal) => signal.eventType === 3101
        );
        const updatedTime = event3101Signal ? event3101Signal.updatedTime : null;

        telemetryData = {
          ignitionStatus: extractSignalValue(signals, "VCU_Data__Ignition_Sts_RX_V", 6500),
          hillHold: extractSignalValue(signals, "Display_info__Hill_Hold_TTL_RX_V", 6500),
          cruiseControlStatus: extractSignalValue(signals, "Display_info__Cruise_Control_TTL_RX_V", 6500),
          tractionControl: extractSignalValue(signals, "Custom_Mode__Traction_Control_TX_V", 6500),
          regenSetting: extractSignalValue(signals, "SOM_Settings_Data__Regen_Setting_TX_V", 6500),
          sideStandStatus: extractSignalValue(signals, "Display_info__Side_Stand_Sts_RX_V", 6500),
          gpsSignalStrength: extractSignalValue(signals, "AL_GPS_SIGNAL_STRENGTH", 3101),
          liveOdo: extractSignalValue(signals, "VCU_Data9__Live_Odo_RX_V", 6500),
          trip1Odo: extractSignalValue(signals, "VCU_Data6__Trip1_Odo_RX_V", 6500),
          trip2Odo: extractSignalValue(signals, "VCU_Data6__Trip2_Odo_RX_V", 6500),
          slcOdo: extractSignalValue(signals, "VCU_Data5__SLC_Odo_RX_V", 6500),
          odometer: extractSignalValue(signals, "VCU_Data5__Odometer_RX_V", 6500),
          lteConnStatus: extractSignalValue(signals, "RF_Parameters_2__LTE_Conn_Sts_TX_V", 6500),
          lteSignalStrength: getSignalStrength(signals),
          trip1DurationHrs: extractSignalValue(signals, "VCU_Data7__T1_Duration_Hrs_RX_V", 6500),
          trip1DurationMins: extractSignalValue(signals, "VCU_Data7__T1_Duration_Mins_RX_V", 6500),
          trip1MaxSpeed: extractSignalValue(signals, "VCU_Data2__T1_Max_Speed_RX_V", 6500),
          trip1AvgSpeed: extractSignalValue(signals, "VCU_Data2__T1_Avg_Speed_RX_V", 6500),
          trip1AvgEff: extractSignalValue(signals, "VCU_Data2__T1_Avg_Eff_RX_V", 6500),
          trip1TotalEnergyConsump: extractSignalValue(signals, "VCU_Data2__T1_Total_Energy_Consump_RX_V", 6500),
          trip2DurationHrs: extractSignalValue(signals, "VCU_Data7__T2_Duration_Hrs_RX_V", 6500),
          trip2DurationMins: extractSignalValue(signals, "VCU_Data7__T2_Duration_Mins_RX_V", 6500),
          trip2AvgEff: extractSignalValue(signals, "VCU_Data3__T2_Avg_Eff_RX_V", 6500),
          trip2TotalEnergyConsump: extractSignalValue(signals, "VCU_Data3__T2_Total_Energy_Consump_RX_V", 6500),
          trip2MaxSpeed: extractSignalValue(signals, "VCU_Data3__T2_Max_Speed_RX_V", 6500),
          trip2AvgSpeed: extractSignalValue(signals, "VCU_Data3__T2_Avg_Speed_RX_V", 6500),
          slcMaxSpeed: extractSignalValue(signals, "VCU_Data4__SLC_Max_Speed_RX_V", 6500),
          slcAvgSpeed: extractSignalValue(signals, "VCU_Data4__SLC_Avg_Speed_RX_V", 6500),
          slcAvgEff: extractSignalValue(signals, "VCU_Data4__SLC_Avg_Eff_RX_V", 6500),
          slcTotalEnergyConsump: extractSignalValue(signals, "VCU_Data4__SLC_Total_Energy_Consump_RX_V", 6500),
          slcDurationMins: extractSignalValue(signals, "VCU_Data4__SLC_Duration_Mins_RX_V", 6500),
          liveDurationHrs: extractSignalValue(signals, "VCU_Data8__Live_Duration_Hrs_RX_V", 6500),
          liveDurationMins: extractSignalValue(signals, "VCU_Data8__Live_Duration_Mins_RX_V", 6500),
          liveMaxSpeed: extractSignalValue(signals, "VCU_Data8__Live_Max_Speed_RX_V", 6500),
          liveAvgSpeed: extractSignalValue(signals, "VCU_Data8__Live_Avg_Speed_RX_V", 6500),
          liveAvgEff: extractSignalValue(signals, "VCU_Data8__Live_Avg_Eff_RX_V", 6500),
          liveTotalEnergyConsump: extractSignalValue(signals, "VCU_Data8__Live_Total_Energy_Consump_RX_V", 6500),
          trip1ResetFlag: extractSignalValue(signals, "SOM_Settings_Data__Trip_1_Reset_flg_TX_V", 6500),
          trip2ResetFlag: extractSignalValue(signals, "SOM_Settings_Data__Trip_2_Reset_flg_TX_V", 6500),
          latitude: extractSignalValue(signals, "AL_LATITUDE", 3101),
          latitudeDirection: extractSignalValue(signals, "AL_LAT_DIR", 3101),
          longitude: extractSignalValue(signals, "AL_LONGITUDE", 3101),
          longitudeDirection: extractSignalValue(signals, "AL_LONG_DIR", 3101),
          gpsStatus: extractSignalValue(signals, "AL_GPS_STATUS", 3101),
          gpsFixValue: extractSignalValue(signals, "AL_GPS_FIX", 3101),
          rideMode: extractSignalValue(signals, "Vehicle_Mode__Ride_Mode_Set_RX_V", 6500),
          absState: extractSignalValue(signals, "SOM_Settings_Data__ABS_State_Sel_TX_V", 6500),
          chargingMode: extractSignalValue(signals, "Chrgr_STS_Info__Chrgr_Mode_RX_V", 6500),
          vehicleRange: extractSignalValue(signals, "Range_Info__DTE_Range_RX_V", 6500),
          conservativeRange: extractSignalValue(signals, "Range_Info__Cons_Range_RX_V", 6500),
          averageRange: extractSignalValue(signals, "Range_Info__Avg_Range_RX_V", 6500),
          aggressiveRange: extractSignalValue(signals, "Range_Info__Agg_Range_RX_V", 6500),
          rangeGain: extractSignalValue(signals, "Range_Info__Range_Gain_RX_V"),
          batterySoc: extractSignalValue(signals, "Batt_Sts_Info__Display_SoC_RX_V", 6500),
          chargingStatus: getChargingStatus(signals),
          vehicleStatus: getVehicleStatus(signals),
          lockStatus: extractSignalValue(signals, "VCU_Data__Veh_Authentication_Flag_RX_V", 6500),
          timeToChargeHrs: extractSignalValue(signals, "Batt_Limits__Time_to_Chrg_Hrs_RX_V", 6500),
          timeToChargeMins: extractSignalValue(signals, "Batt_Limits__Time_to_Chrg_Mins_RX_V", 6500),
          absSensitivity: extractSignalValue(signals, "SOM_Settings_Data__ABS_Sensitivity_Sel_TX_V", 6500),
          powerOutputControl: extractSignalValue(signals, "Custom_Mode__Power_Output_Control_TX_V", 6500),
          throttleMapControl: extractSignalValue(signals, "Custom_Mode__Throttle_Map_Control_TX_V", 6500),
          regenCoastControl: extractSignalValue(signals, "Custom_Mode__Regen_Coast_Control_TX_V", 6500),
          regenBrakeControl: extractSignalValue(signals, "Custom_Mode__Regen_Brake_Control_TX_V", 6500),
          batteryTempMin: extractSignalValue(signals, "Batt_Temp__Batt_Temp_Min_RX_V", 6500),
          batteryTempMax: extractSignalValue(signals, "Batt_Temp__Batt_Temp_Max_RX_V", 6500),
          frontPressureLvl: extractSignalValue(signals, "Front_pressure_level", 6500),
          rearPressureLvl: extractSignalValue(signals, "Rear_pressure_level", 6500),
          frontTempLvl: extractSignalValue(signals, "Front_temperature_level", 6500),
          rearTempLvl: extractSignalValue(signals, "Rear_temperature_level", 6500),
          frontBatteryLvl: extractSignalValue(signals, "Front_battery_level", 6500),
          rearBatteryLvl: extractSignalValue(signals, "Rear_battery_level", 6500),
          // updatedTime: updatedTime,
        };
      }

      // Combine both responses
      return {
        ...stateData,
        ...telemetryData,
      };
    } catch (error) {
      console.error("Error fetching vehicle statuses:", error);
      throw new Error("Failed to fetch vehicle statuses");
    }
  },
  getLockUnlockTracking: async ({ trackingId }) => {
    try {
      const response = await axios.get(
        `${BASE_URL}/command-service/vehicle/command/${trackingId}`,
        {
          headers: {
            accept: "*/*",
            "api-key": CCSERVICE_API_KEY,
            "x-requestor": "abc",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(error);
      return error.response?.data || { message: error.message };
    }
  },
  getVehicleRideModeTracking: async ({ trackingId }) => {
    try {
      const response = await axios.get(
        `${BASE_URL}/cota-service/vehicle-configurations/${trackingId}`,
        {
          headers: {
            accept: "*/*",
            "x-requestor": "test",
            "api-key": COTA_API_KEY,
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(error);
      return error.response?.data || { message: error.message };
    }
  },
  getCampaignVersions: async ({ systemId }) => {
    try {
      // Get current version
      const currentVersionResponse = await axios.get(
        `${BASE_URL}/ota/campaign-manager/vehicles/${systemId}`,
        {
          headers: {
            accept: "*/*",
            "api-key": CAMPAIGN_API_KEY,
            "x-requestor": "admin",
          },
        }
      );

      let currentVersion = null;
      if (currentVersionResponse.data?.vehicle?.ecus) {
        const compositeEcu = currentVersionResponse.data.vehicle.ecus.find(
          (ecu) => ecu.ecuName === "composite"
        );
        if (compositeEcu?.ecuChipsetInfos?.[0]) {
          currentVersion = compositeEcu.ecuChipsetInfos[0].currentVersion;
        }
      }

      let targetVersion = null;
      try {
        const targetVersionResponse = await axios.get(
          `${BASE_URL}/ota/campaign-manager/vehicles/${systemId}/ecus/versions/eligible?ecuName=composite&partNumber=585`,
          {
            headers: {
              accept: "*/*",
              "api-key": CAMPAIGN_API_KEY,
              "x-requestor": "admin",
            },
          }
        );

        if (targetVersionResponse.data?.ecuPackageDetail?.targetVersion) {
          targetVersion =
            targetVersionResponse.data.ecuPackageDetail.targetVersion;
        }
      } catch (error) {
        if (error.response?.data?.errors?.[0]?.code === "21144") {
          targetVersion = "No update available";
        } else {
          throw error;
        }
      }

      return {
        currentVersion,
        targetVersion,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error("Error fetching campaign versions:", error);
      throw new Error("Failed to fetch campaign versions");
    }
  },
  updateLockUnlock: async ({ systemId, name, value }) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/command-service/vehicles/command`,
        {
          name: name,
          systemId: systemId,
          appId: "RE_app",
          input: [
            {
              area: 0,
              value: value,
            },
          ],
          timeout: -1,
        },
        {
          headers: {
            accept: "*/*",
            "x-requestor": "abc",
            "api-key": CCSERVICE_API_KEY,
            "Content-Type": "application/json",
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(error);
      return error.response?.data || { message: error.message };
    }
  },

  updateRideMode: async ({ systemId, mode }) => {
    try {
      const url = `${BASE_URL}/cota-service/vehicle-configurations/update`;
      const payload = {
        updates: [
          {
            action: "EDIT",
            path: "vehicle_settings.vehicle_features.ride_mode",
            value: mode,
          },
        ],
        systemIds: [systemId],
      };
      const headers = {
        "Content-Type": "application/json",
        "api-key": COTA_API_KEY,
        "x-requestor": "test",
      };
      const response = await axios.post(url, payload, { headers });
      return response.data;
    } catch (error) {
      console.error(
        "Error updating ride mode:",
        error.response?.data || error.message
      );
      return error.response?.data || { message: error.message };
    }
  },

  updateCustomMode: async ({ systemId, settings }) => {
    try {
      // Validate that at least one setting is provided
      if (Object.keys(settings).length === 0) {
        throw new Error("At least one custom mode setting must be provided.");
      }

      const url = `${BASE_URL}/cota-service/vehicle-configurations/update`;
      const payload = {
        updates: [
          {
            action: "EDIT",
            path: "vehicle_settings.vehicle_features.custom_ride_mode",
            value: settings,
          },
        ],
        systemIds: [systemId],
      };
      const headers = {
        "Content-Type": "application/json",
        "api-key": COTA_API_KEY,
        "x-requestor": "test",
      };
      const response = await axios.post(url, payload, { headers });
      return response.data;
    } catch (error) {
      console.error(
        "Error updating custom mode:",
        error.response?.data || error.message
      );
      return error.response?.data || { message: error.message };
    }
  },

  updateVehicleMode: async ({
    systemId,
    mode,
    enabled,
    startTime,
    endTime,
  }) => {
    try {
      const url = `${BASE_URL}/cota-service/vehicle-configurations/update`;
      const valuePayload = { enabled };

      // Conditionally add start and end times if they are provided
      if (startTime) {
        valuePayload.start_time = startTime;
      }
      if (endTime) {
        valuePayload.end_time = endTime;
      }

      const payload = {
        updates: [
          {
            action: "EDIT",
            path: `vehicle_settings.vehicle_mode.${mode}`,
            value: valuePayload,
          },
        ],
        systemIds: [systemId],
      };
      const headers = {
        "Content-Type": "application/json",
        "api-key": COTA_API_KEY,
        "x-requestor": "test",
      };
      const response = await axios.post(url, payload, { headers });
      return response.data;
    } catch (error) {
      console.error(
        "Error updating vehicle mode:",
        error.response?.data || error.message
      );
      return error.response?.data || { message: error.message };
    }
  },
  getLastParkedLocation: async ({ systemId }) => {
    try {
      const response = await axios.get(
        `${BASE_URL}/telemetry-curr/vehicles/${systemId}/last-parked-location`,
        {
          headers: {
            accept:
              "application/com.c2c.telemetry.dto.v1.telemetryresponse.v1+json",
            "x-requestor": "x",
            "api-key": TELEMETRY_API_KEY,
          },
        }
      );
      return response.data;
    } catch (error) {
      console.error(error);
      return error.response?.data || { message: error.message };
    }
  },
  getVehicleMetadata: async ({ systemId }) => {
    try {
      const url = `${BASE_URL}/vehicle-ops/metadata?systemId=${systemId}&pageNo=1&pageSize=10`;
      const response = await axios.get(url, {
        headers: {
          accept:
            "application/com.c2c.vehicle.operations.dto.vehicledataresponsedto+json",
          "api-key": VEHICLE_METADATA_API_KEY,
          "x-requestor": "test",
        },
      });

      const details = response.data?.responseData?.vehicleDetails?.[0];
      return {
        systemId: details?.systemId || null,
        model: details?.model || null,
      };
    } catch (error) {
      console.error("Error fetching vehicle metadata:", error);
      throw new Error("Failed to fetch vehicle metadata");
    }
  },
  getVehicleHealthStatus: async ({ systemId }) => {
    try {
      const url = `${BASE_URL}/vehicle-diagnostics/vehicles/${systemId}/health-report`;
      const response = await axios.get(url, {
        headers: {
          accept: "*/*",
          "api-key": VEHICLE_HEALTH_API_KEY,
          "x-requestor": "abc",
        },
      });

      const vehicleStatus =
        response.data?.vehicleHealthReport?.vehicleStatus || null;
      return {
        vehicleStatus,
        batteryHealth: "good",
        motorHealth: "good",
        mcuHealth: "good",
      };
    } catch (error) {
      console.error("Error fetching vehicle health status:", error);
      throw new Error("Failed to fetch vehicle health status");
    }
  },
};

app.use(
  "/ffapp",
  (req, res, next) => {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey || apiKey !== INGRESS_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  },
  graphqlHTTP({
    schema: schema,
    rootValue: root,
    graphiql: true,
  })
);

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`GraphQL server listening on port ${PORT}`);
});

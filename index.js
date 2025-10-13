const express = require("express");
const { graphqlHTTP } = require("express-graphql");
const { buildSchema } = require("graphql");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(express.json());

const INGRESS_API_KEY = process.env.API_KEY || "dashboard-api-key";
const BASE_URL = process.env.BASE_URL || "https://cbp-eu-uat.royalenfield.com";
const COTA_API_KEY = "YzB0YSRlcnZpY2VANDU2";
const STATE_API_KEY = "JHRhdGVvcGVyYXRpMCRuJGVydmljZUA0NTY";
const TELEMETRY_API_KEY = "dGVsZW1ldHJ5LWN1cnJAMTIz";
const CCSERVICE_API_KEY = "Y2NzZXJ2aWNlQDc4OQ";

// GraphQL schema
const schema = buildSchema(`
  type Query {
    getVehicleState(systemId: String!): VehicleStateResponse
    getVehicleStatuses(systemId: String!): VehicleStatusesResponse
    getLockUnlockStatus(systemId: String!): LockUnlockStatusResponse
    getLockUnlockTracking(trackingId: String!): JSON
    getVehicleRideModeTracking(trackingId: String!): JSON
    getLastParkedLocation(systemId: String!): JSON
  }

  type Mutation {
    updateLockUnlock(systemId: String!, name: String!, value: Int!): JSON
    updateVehicleRideMode(systemId: String!, startTime: Float!, endTime: Float!, modeType: String!, mode: String!): JSON
  }

  scalar JSON

  type VehicleStateResponse {
    parkMode: String
    ignition: String
    status: String
    lastHeartBeatTime: String
    currentState: String
    connectionState: String
    gpsFix: String
    vehicleMode: String
  }

  type VehicleStatusesResponse {
    hillHold: String
    cruiseControlStatus: String
    tractionControl: String
    regenSetting: String
    sideStandStatus: String
    gpsSignalStrength: String
    tpmsFront: String
    tpmsRear: String
    liveOdo: String
    trip1Odo: String
    trip2Odo: String
    slcOdo: String
    odometer: String
    lteConnStatus: String
    lteRSRQ: String
    lteRSRP: String
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
    mcuRideMode: String
    absState: String
    chargingMode: String
    vehicleRange: String
    batterySoc: String
    updatedTime: String
  }

  type SignalValue {
    name: String
    value: String
  }

  type LockUnlockStatusResponse {
    lockUnlockStatus: String
  }

  type CommandResponse {
    status: String
    trackingId: String
    message: String
  }
`);

// Helper function to extract signal value
const extractSignalValue = (signals, signalName) => {
  const signal = signals.find((s) => s.name === signalName);
  return signal ? signal.value : null;
};

// Resolver function for the query
const root = {
  getVehicleState: async ({ systemId }) => {
    try {
      const response = await axios.post(
        `${BASE_URL}/state-operation-service/state/vehicles`,
        [systemId],
        {
          headers: {
            "Content-Type": "application/json",
            "api-key": STATE_API_KEY,
            "x-requestor": "test",
          },
        }
      );

      const data = response.data;

      if (data.result && data.result.length > 0) {
        const vehicleData = data.result[0].responseData.vehicleStateData;
        const lastHeartBeatTime = data.result[0].responseData.lastHeartBeatTime;
        return {
          parkMode: vehicleData.parkMode,
          ignition: vehicleData.ignition,
          status: data.result[0].status,
          lastHeartBeatTime: String(lastHeartBeatTime),
          currentState: vehicleData.currentState,
          connectionState: vehicleData.connectionState,
          gpsFix: vehicleData.gpsFix,
          vehicleMode: vehicleData.vehicleMode,
        };
      } else {
        throw new Error("Vehicle data not found");
      }
    } catch (error) {
      console.error(error);
      throw new Error("Failed to fetch vehicle state");
    }
  },
  getVehicleStatuses: async ({ systemId }) => {
    try {
      const response = await axios.get(
        `${BASE_URL}/telemetry-curr/current-value/${systemId}`,
        {
          headers: {
            accept: "*/*",
            "x-requestor": "test",
            "api-key": TELEMETRY_API_KEY,
          },
        }
      );

      const data = response.data;

      if (data && data.responseData && data.responseData.signals) {
        const signals = data.responseData.signals;

        const event3101Signal = data.responseData.signals.find(
          (signal) => signal.eventType === 3101
        );
        const updatedTime = event3101Signal
          ? event3101Signal.updatedTime
          : null;

        return {
          hillHold: extractSignalValue(
            signals,
            "Display_info__Hill_Hold_TTL_RX_V"
          ),
          cruiseControlStatus: extractSignalValue(
            signals,
            "MCU_Data_2__Cruise_Control_Status_RX_V"
          ),
          tractionControl: extractSignalValue(
            signals,
            "Custom_Mode__Traction_Control_TX_V"
          ),
          regenSetting: extractSignalValue(
            signals,
            "SOM_Settings_Data__Regen_Setting_TX_V"
          ),
          sideStandStatus: extractSignalValue(
            signals,
            "Display_info__Side_Stand_Sts_RX_V"
          ),
          gpsSignalStrength: extractSignalValue(
            signals,
            "AL_GPS_SIGNAL_STRENGTH"
          ),
          tpmsFront: extractSignalValue(
            signals,
            "SOM_Settings_Data__TPMS_Front_TX_V"
          ),
          tpmsRear: extractSignalValue(
            signals,
            "SOM_Settings_Data__TPMS_Rear_TX_V"
          ),
          liveOdo: extractSignalValue(signals, "VCU_Data9__Live_Odo_RX_V"),
          trip1Odo: extractSignalValue(signals, "VCU_Data6__Trip1_Odo_RX_V"),
          trip2Odo: extractSignalValue(signals, "VCU_Data6__Trip2_Odo_RX_V"),
          slcOdo: extractSignalValue(signals, "VCU_Data5__SLC_Odo_RX_V"),
          odometer: extractSignalValue(signals, "VCU_Data5__Odometer_RX_V"),
          lteConnStatus: extractSignalValue(
            signals,
            "RF_Parameters_2__LTE_Conn_Sts_TX_V"
          ),
          lteRSRQ: extractSignalValue(
            signals,
            "RF_Parameters_2__LTE_RSRQ_TX_V"
          ),
          lteRSRP: extractSignalValue(
            signals,
            "RF_Parameters_2__LTE_RSRP_TX_V"
          ),
          trip1DurationHrs: extractSignalValue(
            signals,
            "VCU_Data7__T1_Duration_Hrs_RX_V"
          ),
          trip1DurationMins: extractSignalValue(
            signals,
            "VCU_Data7__T1_Duration_Mins_RX_V"
          ),
          trip1MaxSpeed: extractSignalValue(
            signals,
            "VCU_Data2__T1_Max_Speed_RX_V"
          ),
          trip1AvgSpeed: extractSignalValue(
            signals,
            "VCU_Data2__T1_Avg_Speed_RX_V"
          ),
          trip1AvgEff: extractSignalValue(
            signals,
            "VCU_Data2__T1_Avg_Eff_RX_V"
          ),
          trip1TotalEnergyConsump: extractSignalValue(
            signals,
            "VCU_Data2__T1_Total_Energy_Consump_RX_V"
          ),
          trip2DurationHrs: extractSignalValue(
            signals,
            "VCU_Data7__T2_Duration_Hrs_RX_V"
          ),
          trip2DurationMins: extractSignalValue(
            signals,
            "VCU_Data7__T2_Duration_Mins_RX_V"
          ),
          trip2AvgEff: extractSignalValue(
            signals,
            "VCU_Data3__T2_Avg_Eff_RX_V"
          ),
          trip2TotalEnergyConsump: extractSignalValue(
            signals,
            "VCU_Data3__T2_Total_Energy_Consump_RX_V"
          ),
          trip2MaxSpeed: extractSignalValue(
            signals,
            "VCU_Data3__T2_Max_Speed_RX_V"
          ),
          trip2AvgSpeed: extractSignalValue(
            signals,
            "VCU_Data3__T2_Avg_Speed_RX_V"
          ),
          slcMaxSpeed: extractSignalValue(
            signals,
            "VCU_Data4__SLC_Max_Speed_RX_V"
          ),
          slcAvgSpeed: extractSignalValue(
            signals,
            "VCU_Data4__SLC_Avg_Speed_RX_V"
          ),
          slcAvgEff: extractSignalValue(signals, "VCU_Data4__SLC_Avg_Eff_RX_V"),
          slcTotalEnergyConsump: extractSignalValue(
            signals,
            "VCU_Data4__SLC_Total_Energy_Consump_RX_V"
          ),
          slcDurationMins: extractSignalValue(
            signals,
            "VCU_Data4__SLC_Duration_Mins_RX_V"
          ),
          liveDurationHrs: extractSignalValue(
            signals,
            "VCU_Data8__Live_Duration_Hrs_RX_V"
          ),
          liveDurationMins: extractSignalValue(
            signals,
            "VCU_Data8__Live_Duration_Mins_RX_V"
          ),
          liveMaxSpeed: extractSignalValue(
            signals,
            "VCU_Data8__Live_Max_Speed_RX_V"
          ),
          liveAvgSpeed: extractSignalValue(
            signals,
            "VCU_Data8__Live_Avg_Speed_RX_V"
          ),
          liveAvgEff: extractSignalValue(
            signals,
            "VCU_Data8__Live_Avg_Eff_RX_V"
          ),
          liveTotalEnergyConsump: extractSignalValue(
            signals,
            "VCU_Data8__Live_Total_Energy_Consump_RX_V"
          ),
          trip1ResetFlag: extractSignalValue(
            signals,
            "SOM_Settings_Data__Trip_1_Reset_flg_TX_V"
          ),
          trip2ResetFlag: extractSignalValue(
            signals,
            "SOM_Settings_Data__Trip_2_Reset_flg_TX_V"
          ),
          latitude: extractSignalValue(signals, "AL_LATITUDE"),
          latitudeDirection: extractSignalValue(signals, "AL_LAT_DIR"),
          longitude: extractSignalValue(signals, "AL_LONGITUDE"),
          longitudeDirection: extractSignalValue(signals, "AL_LONG_DIR"),
          gpsStatus: extractSignalValue(signals, "AL_GPS_STATUS"),
          gpsFixValue: extractSignalValue(signals, "AL_GPS_FIX"),
          mcuRideMode: extractSignalValue(
            signals,
            "MCU_Data_2__MCU_Ride_Modes_RX_V"
          ),
          absState: extractSignalValue(
            signals,
            "SOM_Settings_Data__ABS_State_Sel_TX_V"
          ),
          chargingMode: extractSignalValue(
            signals,
            "Chrgr_STS_Info__Chrgr_Mode_RX_V"
          ),
          vehicleRange: extractSignalValue(
            signals,
            "Display_info__Vehicle_Range_RX_V"
          ),
          batterySoc: extractSignalValue(
            signals,
            "Batt_Sts_Info__Display_SoC_RX_V"
          ),
          updatedTime: updatedTime,
        };
      } else {
        console.warn("Signals not found in response data:", data);
        return {};
      }
    } catch (error) {
      console.error("Error fetching vehicle statuses:", error);
      throw new Error("Failed to fetch vehicle statuses");
    }
  },
  getLockUnlockStatus: async ({ systemId }) => {
    try {
      const response = await axios.get(
        `${BASE_URL}/cota-service/vehicles/${systemId}/config`,
        {
          headers: {
            accept:
              "application/com.c2c.cota.common.dto.response.configresponsedto+json",
            "x-requestor": "test",
            "api-key": COTA_API_KEY,
          },
        }
      );

      const data = response.data;

      if (
        data &&
        data.configurations &&
        data.configurations.vehicle_settings &&
        data.configurations.vehicle_settings.vehicle_features
      ) {
        const lockUnlockStatus =
          data.configurations.vehicle_settings.vehicle_features[
            "vehicle_remote_lock/unlock_via_lte"
          ];
        return {
          lockUnlockStatus: lockUnlockStatus,
        };
      } else {
        throw new Error("Lock unlock status not found");
      }
    } catch (error) {
      console.error(error);
      throw new Error("Failed to fetch lock unlock status");
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

  updateVehicleRideMode: async ({
    systemId,
    startTime,
    endTime,
    modeType,
    mode,
  }) => {
    try {
      const dynamicPath = `vehicle_settings.${modeType}.${mode}`;

      const payload = {
        updates: [
          {
            action: "EDIT",
            path: dynamicPath,
            value: {
              enabled: false,
              start_time: startTime,
              end_time: endTime,
            },
          },
        ],
        systemIds: [systemId],
      };

      const response = await axios.post(BASE_URL, payload, {
        headers: {
          "Content-Type": "application/json",
          "api-key": COTA_API_KEY,
          "x-requestor": "test",
        },
      });

      return response.data;
    } catch (error) {
      console.error(
        "Error updating vehicle ride mode:",
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

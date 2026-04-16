require("dotenv").config();
const express = require("express");
const { graphqlHTTP } = require("express-graphql");
const { buildSchema } = require("graphql");
const { Pool } = require("pg");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT;

// PostgreSQL connection pool for efficient querying
const pool = new Pool({
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: {
    rejectUnauthorized: false
  }
});

const TABLE_NAME = process.env.TABLE_NAME;

const schema = buildSchema(`
  type Device {
    imei_primary: String
    vendor_code: Int
    category: String
    part_no: String
    hw_version: String
    serial_no: String
    iccid: String
    euid: String
    system_id: String
    status: String
    admin_key: String
    user_key: String
    som_ble_mac_id: String
    som_ble_pass_phrase: String
    som_wifi_mac_2_4ghz: String
    som_wifi_ssid_connection_2_5ghz: String
    som_wifi_pass_phrase_2_5ghz: String
    som_wifi_mac_5ghz: String
    som_wifi_ssid_connection_5ghz: String
    som_wifi_pass_phrase_5ghz: String
    bcm_1st_ble_mac_id: String
    bcm_1st_ble_connection_name: String
    bcm_1st_ble_pass_phrase: String
    som_bt_mac_id: String
    som_bt_connection_name: String
    som_bt_pass_phrase: String
    bcm_2nd_bt_mac_id: String
    bcm_2nd_bt_connection_name: String
    bcm_2nd_bt_pass_phrase: String
    som_make: Int
    som_sw_version: Float
    model: String
    imei_secondary: String
    gsm_creg: Int
    shipment_invoice: String
    esim_part_no: String
    esim_vendor_code: String
    esim_imsi: String
    esim_msisdn: String
    esim_apn: String
    created_by: String
    created_time: String
    updated_by: String
    updated_time: String
    manufacturing_date: String
    firmware_version: Float
    config_version: Float
  }

  input UpdateDeviceInput {
    vendor_code: Int
    category: String
    part_no: String
    hw_version: String
    serial_no: String
    iccid: String
    euid: String
    system_id: String
    status: String
    admin_key: String
    user_key: String
    som_ble_mac_id: String
    som_ble_pass_phrase: String
    som_wifi_mac_2_4ghz: String
    som_wifi_ssid_connection_2_5ghz: String
    som_wifi_pass_phrase_2_5ghz: String
    som_wifi_mac_5ghz: String
    som_wifi_ssid_connection_5ghz: String
    som_wifi_pass_phrase_5ghz: String
    bcm_1st_ble_mac_id: String
    bcm_1st_ble_connection_name: String
    bcm_1st_ble_pass_phrase: String
    som_bt_mac_id: String
    som_bt_connection_name: String
    som_bt_pass_phrase: String
    bcm_2nd_bt_mac_id: String
    bcm_2nd_bt_connection_name: String
    bcm_2nd_bt_pass_phrase: String
    som_make: Int
    som_sw_version: Float
    model: String
    imei_secondary: String
    gsm_creg: Int
    shipment_invoice: String
    esim_part_no: String
    esim_vendor_code: String
    esim_imsi: String
    esim_msisdn: String
    esim_apn: String
    manufacturing_date: String
    firmware_version: Float
    config_version: Float
    updated_by: String
  }

  type UpdateDeviceResponse {
    message: String!
    data: Device
  }

  type DeleteDeviceResponse {
    message: String!
    deletedDevice: Device
  }

  type Query {
    getDevice(imei: String!): Device
  }

  type Mutation {
    updateDevice(imei: String!, input: UpdateDeviceInput!): UpdateDeviceResponse
    deleteDevice(imei: String!): DeleteDeviceResponse
  }
`);

// Resolvers
const root = {
  // Get device by IMEI
  getDevice: async ({ imei }) => {
    try {
      if (!imei || isNaN(imei)) {
        throw new Error("Invalid IMEI. Must be a numeric value.");
      }

      const query = `SELECT * FROM ${TABLE_NAME} WHERE imei_primary = $1`;
      const result = await pool.query(query, [imei]);

      if (result.rowCount === 0) {
        throw new Error(`Device with IMEI ${imei} not found.`);
      }

      return result.rows[0];
    } catch (error) {
      throw new Error(error.message);
    }
  },

  // Update device by IMEI
  updateDevice: async ({ imei, input }) => {
    try {
      if (!imei || isNaN(imei)) {
        throw new Error("Invalid IMEI. Must be a numeric value.");
      }

      if (!input || Object.keys(input).length === 0) {
        throw new Error("No update data provided.");
      }

      const allowedFields = [
        "vendor_code", "category", "part_no", "hw_version", "serial_no",
        "iccid", "euid", "system_id", "status", "admin_key", "user_key",
        "som_ble_mac_id", "som_ble_pass_phrase", "som_wifi_mac_2_4ghz",
        "som_wifi_ssid_connection_2_5ghz", "som_wifi_pass_phrase_2_5ghz",
        "som_wifi_mac_5ghz", "som_wifi_ssid_connection_5ghz",
        "som_wifi_pass_phrase_5ghz", "bcm_1st_ble_mac_id",
        "bcm_1st_ble_connection_name", "bcm_1st_ble_pass_phrase",
        "som_bt_mac_id", "som_bt_connection_name", "som_bt_pass_phrase",
        "bcm_2nd_bt_mac_id", "bcm_2nd_bt_connection_name",
        "bcm_2nd_bt_pass_phrase", "som_make", "som_sw_version", "model",
        "imei_secondary", "gsm_creg", "shipment_invoice", "esim_part_no",
        "esim_vendor_code", "esim_imsi", "esim_msisdn", "esim_apn",
        "manufacturing_date", "firmware_version", "config_version",
        "updated_by"
      ];

      const updates = [];
      const values = [];
      let paramIndex = 1;

      for (const [key, value] of Object.entries(input)) {
        if (allowedFields.includes(key) && value !== undefined && value !== null) {
          updates.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }

      if (updates.length === 0) {
        throw new Error("No valid fields to update.");
      }

      updates.push(`updated_time = $${paramIndex}`);
      values.push(Date.now());
      paramIndex++;

      values.push(imei);

      const query = `
        UPDATE ${TABLE_NAME}
        SET ${updates.join(", ")}
        WHERE imei_primary = $${paramIndex}
        RETURNING *
      `;

      const result = await pool.query(query, values);

      if (result.rowCount === 0) {
        throw new Error(`Device with IMEI ${imei} not found.`);
      }

      return {
        message: "Device updated successfully",
        data: result.rows[0],
      };
    } catch (error) {
      throw new Error(error.message);
    }
  },

  // Delete device by IMEI
  deleteDevice: async ({ imei }) => {
    try {
      if (!imei || isNaN(imei)) {
        throw new Error("Invalid IMEI. Must be a numeric value.");
      }

      const query = `
        DELETE FROM ${TABLE_NAME}
        WHERE imei_primary = $1
        RETURNING *
      `;

      const result = await pool.query(query, [imei]);

      if (result.rowCount === 0) {
        throw new Error(`Device with IMEI ${imei} not found.`);
      }

      return {
        message: "Device deleted successfully",
        deletedDevice: result.rows[0],
      };
    } catch (error) {
      throw new Error(error.message);
    }
  },
};

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "device-management-api" });
});

// GraphQL endpoint
app.use(
  "/supplier-feed",
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
  })
);

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing database pool...");
  await pool.end();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, closing database pool...");
  await pool.end();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Device Management GraphQL API listening on port ${PORT}`);
  console.log(`GraphQL endpoint: http://localhost:${PORT}/supplier-feed`);
});

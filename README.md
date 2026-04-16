# Device Management API

GraphQL API for efficient device management operations - update and delete devices by IMEI.

## Features

- ✅ Update device records by IMEI
- ✅ Delete device records by IMEI
- ✅ Get device details by IMEI
- ✅ Efficient PostgreSQL connection pooling
- ✅ Parameterized queries to prevent SQL injection
- ✅ Input validation
- ✅ GraphiQL interface for testing
- ✅ Proper error handling

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. Start the server:
```bash
npm start
# or for development with auto-reload
npm run dev
```

## GraphQL Endpoint

**URL:** `http://localhost:4020/graphql`

The GraphiQL interface is available at the same URL for interactive query testing.

## GraphQL Schema

### Query

#### Get Device by IMEI
```graphql
query GetDevice {
  getDevice(imei: "123456789012345") {
    imei_primary
    vendor_code
    system_id
    status
    model
    vin
    som_sw_version
    firmware_version
    config_version
    created_time
    updated_time
  }
}
```

### Mutations

#### Update Device by IMEI
```graphql
mutation UpdateDevice {
  updateDevice(
    imei: "123456789012345"
    input: {
      status: "provisioned"
      system_id: "NEW_SYSTEM_ID"
      vendor_code: 2001
      updated_by: "admin"
    }
  ) {
    message
    data {
      imei_primary
      system_id
      status
      updated_time
      updated_by
    }
  }
}
```

**Available Input Fields:**
- vendor_code, category, part_no, hw_version, serial_no
- iccid, euid, system_id, status, admin_key, user_key
- som_ble_mac_id, som_ble_pass_phrase
- som_wifi_mac_2_4ghz, som_wifi_ssid_connection_2_5ghz, som_wifi_pass_phrase_2_5ghz
- som_wifi_mac_5ghz, som_wifi_ssid_connection_5ghz, som_wifi_pass_phrase_5ghz
- bcm_1st_ble_mac_id, bcm_1st_ble_connection_name, bcm_1st_ble_pass_phrase
- som_bt_mac_id, som_bt_connection_name, som_bt_pass_phrase
- bcm_2nd_bt_mac_id, bcm_2nd_bt_connection_name, bcm_2nd_bt_pass_phrase
- som_make, som_sw_version, model, imei_secondary, gsm_creg
- shipment_invoice, esim_part_no, esim_vendor_code, esim_imsi, esim_msisdn, esim_apn
- manufacturing_date, firmware_version, config_version, updated_by

**Note:** `updated_time` is automatically set to current timestamp.

#### Delete Device by IMEI
```graphql
mutation DeleteDevice {
  deleteDevice(imei: "123456789012345") {
    message
    deletedDevice {
      imei_primary
      system_id
      status
    }
  }
}
```

## Example Usage with curl

### Get Device
```bash
curl -X POST http://localhost:4020/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query { getDevice(imei: \"123456789012345\") { imei_primary system_id status } }"
  }'
```

### Update Device
```bash
curl -X POST http://localhost:4020/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { updateDevice(imei: \"123456789012345\", input: { status: \"provisioned\", system_id: \"SYS_NEW_001\", updated_by: \"admin\" }) { message data { imei_primary status system_id updated_time } } }"
  }'
```

### Delete Device
```bash
curl -X POST http://localhost:4020/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { deleteDevice(imei: \"123456789012345\") { message deletedDevice { imei_primary system_id status } } }"
  }'
```

## Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "service": "device-management-api"
}
```

## Error Handling

GraphQL errors are returned in the standard GraphQL error format:

```json
{
  "errors": [
    {
      "message": "Device with IMEI 123456789012345 not found.",
      "locations": [{ "line": 2, "column": 3 }],
      "path": ["getDevice"]
    }
  ],
  "data": null
}
```

## Database Optimization

The API uses the following optimizations to prevent database overload:

1. **Connection Pooling**: Max 20 concurrent connections with automatic recycling
2. **Parameterized Queries**: Prevents SQL injection and improves query planning
3. **Indexed Lookups**: Uses `imei_primary` as the primary key for fast lookups
4. **Graceful Shutdown**: Properly closes database connections on termination
5. **Conditional Updates**: Only updates fields that are provided and non-null

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 4020 |
| PG_HOST | PostgreSQL host | localhost |
| PG_PORT | PostgreSQL port | 5432 |
| PG_DATABASE | Database name | c2c_device_registration_service_db |
| PG_USER | Database user | - |
| PG_PASSWORD | Database password | - |
| TABLE_NAME | Table name | t_supplier_feed |

## GraphQL Types

### Device Type
Complete device information with all fields from the database table.

### UpdateDeviceInput
Input type for updating device fields. All fields are optional.

### UpdateDeviceResponse
```graphql
{
  message: String!
  data: Device
}
```

### DeleteDeviceResponse
```graphql
{
  message: String!
  deletedDevice: Device
}
```

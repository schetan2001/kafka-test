# ME Ticket Connector

Automated ManageEngine ticket creation and resolution service that consumes DTC (Diagnostic Trouble Code) events from Kafka and manages support tickets with PostgreSQL persistence.

## Features

- **Kafka Consumer**: Listens to DTC events from Kafka topics
- **Automated Ticket Management**: 
  - Creates tickets when faults are detected (status: OPEN)
  - Resolves tickets when faults are cleared (status: CLOSED)
- **PostgreSQL Integration**: Stores ticket details in `ff_dtc_tickets` table
- **MongoDB Integration**: Fetches VIN from vehicle provisioning database
- **Location Services**: Reverse geocoding for fault location addresses
- **ManageEngine API**: Direct integration with ME Service Desk Plus

## Ticket Lifecycle

1. **OPEN Status**: Creates new ticket in ManageEngine and stores in database
2. **CLOSED Status**: Resolves existing ticket and updates database with resolved_time

## Database Schema

The service stores tickets in the `ff_dtc_tickets` table:

```sql
CREATE TABLE ff_dtc_tickets (
  id SERIAL PRIMARY KEY,
  request_id VARCHAR(50) UNIQUE NOT NULL,
  display_id VARCHAR(50),
  system_id VARCHAR(100) NOT NULL,
  vin VARCHAR(50),
  dtc_id VARCHAR(50),
  dtc_code VARCHAR(50),
  dtc_description TEXT,
  ecu_type VARCHAR(10),
  severity VARCHAR(20),
  ticket_status VARCHAR(50),
  created_time BIGINT,
  resolved_time BIGINT,
  location_address TEXT
);
```

## Setup

### Prerequisites

- Node.js v18+
- Kafka broker access
- PostgreSQL database (c2c_vehicle_diagnostic_db)
- MongoDB access
- ManageEngine Service Desk Plus API access

### Installation

```bash
npm install
```

### Environment Variables

Configure the following in `.env`:

```env
# Kafka
KAFKA_BROKER=localhost:9092
KAFKA_TOPIC=dtc-events-topic

# Server
SERVER_PORT=4000

# PostgreSQL (for ticket storage)
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=c2c_vehicle_diagnostic_db
PG_USER=your_pg_user
PG_PASSWORD=your_pg_password

# MongoDB
MONGO_URI=mongodb://...
MONGO_DB=re-fulfilment-layer
MONGO_COLLECTION=common_provision_detail

# Telemetry API
TELEMETRY_API_URL=https://...
TELEMETRY_API_KEY=your_api_key

# Google Maps API
GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# Support Portal
SUPPORT_PORTAL_BASE_URL=https://...
```

## Running the Service

```bash
npm start
```

## Kafka Message Format

Expected message structure:

```json
{
  "systemId": "1Y-j2ikYKamnclNUlbydt",
  "dtcId": "12345",
  "dtcCode": "P0420",
  "description": "Catalyst System Efficiency Below Threshold",
  "status": "OPEN",
  "eventTime": 1773500000000,
  "severity": "Critical",
  "clearedAt": null
}
```

## API Endpoints

- `GET /` - Health check endpoint

## Ticket Details Stored

- **request_id**: ManageEngine ticket ID
- **display_id**: Display key from ME response
- **system_id**: Vehicle system identifier
- **vin**: Vehicle Identification Number
- **dtc_id**: Diagnostic Trouble Code ID
- **dtc_code**: DTC code (e.g., P0420)
- **dtc_description**: Human-readable fault description
- **ecu_type**: ECU category (K for Flying Flea)
- **severity**: Fault severity level
- **ticket_status**: Open/Resolved
- **created_time**: Ticket creation timestamp
- **resolved_time**: Ticket resolution timestamp
- **location_address**: Geocoded fault location

## Architecture

```
Kafka Topic (DTC Events)
    ↓
Kafka Consumer
    ↓
MongoDB (Fetch VIN) ← → Ticket Handler → ManageEngine API
    ↓                        ↓
Location Service      PostgreSQL (ff_dtc_tickets)
```

# Factre Kafka SSE Service

A Server-Sent Events (SSE) REST API that listens to a Kafka topic and streams filtered messages based on VIN/systemId.

## Features

- SSE endpoint that accepts VIN as parameter
- Fetches systemId from VIN using GraphQL API
- Consumes messages from Kafka topic
- Filters messages by system_id
- Streams matching messages to connected clients in real-time
- No parsing - streams raw Kafka messages as received

## Prerequisites

- Node.js >= 14.x
- Kafka broker running
- Access to the Royal Enfield GraphQL endpoint

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```env
PORT=3000
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=vin-kafka-sse-service
KAFKA_GROUP_ID=vin-sse-consumer-group
KAFKA_TOPIC=telemetry-topic
GRAPHQL_ENDPOINT=https://cbpuat-in-api.royalenfield.com/ffmech/core/v1/graphql
```

## Usage

### Start the service

```bash
npm start
```

For development with auto-reload:

```bash
npm run dev
```

### Connect to SSE stream

```bash
curl -N http://localhost:3000/stream/REPRO20260305PP10
```

Or use in browser/client:

```javascript
const eventSource = new EventSource('http://localhost:3000/stream/REPRO20260305PP10');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received message:', data);
};

eventSource.onerror = (error) => {
  console.error('SSE error:', error);
};
```

### Health check

```bash
curl http://localhost:3000/health
```

## API Endpoints

### GET /stream/:vin

Stream Kafka messages filtered by VIN.

**Parameters:**
- `vin` (path parameter) - Vehicle Identification Number

**Response:**
- Content-Type: `text/event-stream`
- Streams JSON messages as Server-Sent Events

**Example:**
```bash
GET /stream/REPRO20260305PP10
```

### GET /health

Health check endpoint showing service status and active connections.

**Response:**
```json
{
  "status": "ok",
  "activeConnections": 2,
  "timestamp": "2026-03-10T10:30:00.000Z"
}
```

## How It Works

1. Client connects to `/stream/:vin` endpoint
2. Service queries GraphQL API to get `systemId` for the provided VIN
3. Connection is established and stored with the systemId
4. Kafka consumer continuously reads messages from the configured topic
5. For each message, the service extracts `meta.system_id`
6. If the system_id matches any active connection's systemId, the raw message is streamed to that client
7. Messages are sent in SSE format: `data: {json}\n\n`

## Docker

Build:
```bash
docker build -t factre-kafka-sse-service .
```

Run:
```bash
docker run -p 3000:3000 --env-file .env factre-kafka-sse-service
```

## Sample Kafka Message Format

```json
{
  "meta": {
    "vin": "",
    "device_id": "ID0SUPERENGR840",
    "system_id": "GLSNSDyHrmGgK6LZ3EhK1",
    "sub_system_id": "1",
    "trip_id": "GLSNSDyHrmGgK6LZ3EhK1_1771929694953",
    "sequence_no": "18",
    "packet_status": "LIVE"
  },
  "telemetry": [...]
}
```

## Notes

- The service filters messages based on `meta.system_id` field
- Messages are streamed as-is without any parsing or transformation
- Multiple clients can connect with different VINs simultaneously
- Each client will only receive messages matching their VIN's systemId
- Connections are automatically cleaned up on client disconnect

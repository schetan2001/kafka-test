# Vehicle Tracking SSE Service

Real-time vehicle tracking service that consumes telemetry data from Kafka and streams it to clients via Server-Sent Events (SSE). Supports tracking multiple vehicles simultaneously.

## Features

- **Multi-vehicle tracking**: Track multiple vehicles in a single SSE connection
- **Real-time updates**: Streams GPS and telemetry data as it arrives from Kafka
- **Dual endpoints**: Support for both POST and GET requests
- **Selective data**: Only streams relevant tracking fields (GPS, battery, tire pressure, etc.)
- **Vehicle status logic**: Intelligent vehicle status calculation
- **Persistent state**: Maintains latest data for each vehicle

## Tracked Data Fields

### GPS Data (Event Type 3101)
- Latitude & Longitude with directions
- GPS fix value and signal strength
- GPS status

### Vehicle Data (Event Type 6500)
- Front & rear tire pressure levels
- Ignition status
- Live odometer reading
- Battery State of Charge (SoC)
- Ride mode
- Vehicle status (Riding, Parked, Locked, Unlocked)

## API Endpoints

### POST /stream

Track vehicles using POST request with JSON body.

**Request:**
```bash
curl -X POST http://localhost:4015/stream \
  -H "Content-Type: application/json" \
  -d '{
    "systemIds": ["VEHICLE_001", "VEHICLE_002", "VEHICLE_003"]
  }'
```

**Response:** SSE stream with data for all requested vehicles

```
data: {"VEHICLE_001":{"systemId":"VEHICLE_001","timestamp":"2026-03-13T10:30:00Z","latitude":"28.5355","longitude":"77.3910",...},"VEHICLE_002":{...}}

data: {"VEHICLE_001":{"systemId":"VEHICLE_001","timestamp":"2026-03-13T10:30:05Z",...}}
```

### GET /stream

Track vehicles using GET request with query parameters.

**Request:**
```bash
curl -N http://localhost:4015/stream?systemIds=VEHICLE_001,VEHICLE_002,VEHICLE_003
```

**Response:** Same SSE stream format as POST endpoint

### GET /health

Check service health and statistics.

**Request:**
```bash
curl http://localhost:4015/health
```

**Response:**
```json
{
  "status": "healthy",
  "activeConnections": 5,
  "trackedVehicles": 12
}
```

## Setup

### Prerequisites
- Node.js 18+
- Kafka broker
- Input topic with telemetry data

### Installation

1. Clone and navigate to the service directory
2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example .env
   ```

4. Update `.env` with your configuration:
   ```env
   KAFKA_BROKER=your-kafka-broker:9092
   INPUT_TOPIC=your-telemetry-topic
   KAFKA_GROUP_ID=vehicle-tracking-sse-group
   PORT=4015
   ```

5. Start the service:
   ```bash
   npm start
   ```

## Docker Deployment

Build and run using Docker:

```bash
# Build image
docker build -t vehicle-tracking-sse .

# Run container
docker run -d \
  -p 4015:4015 \
  -e KAFKA_BROKER=kafka:9092 \
  -e INPUT_TOPIC=telemetry-raw \
  --name vehicle-tracking-sse \
  vehicle-tracking-sse
```

## Client Examples

### JavaScript (Browser)

```javascript
const systemIds = ['VEHICLE_001', 'VEHICLE_002'];

// Using POST
fetch('http://localhost:4015/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ systemIds })
}).then(response => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  function read() {
    reader.read().then(({ done, value }) => {
      if (done) return;
      
      const text = decoder.decode(value);
      const lines = text.split('\n');
      
      lines.forEach(line => {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          console.log('Received:', data);
          // data = { VEHICLE_001: {...}, VEHICLE_002: {...} }
        }
      });
      
      read();
    });
  }
  
  read();
});

// Using GET with EventSource
const eventSource = new EventSource(
  `http://localhost:4015/stream?systemIds=${systemIds.join(',')}`
);

eventSource.onmessage = (event) => {
  const vehicles = JSON.parse(event.data);
  console.log('Vehicles:', vehicles);
};

eventSource.onerror = (error) => {
  console.error('SSE error:', error);
  eventSource.close();
};
```

### Python

```python
import requests
import json

systemIds = ['VEHICLE_001', 'VEHICLE_002']

# Using POST
response = requests.post(
    'http://localhost:4015/stream',
    json={'systemIds': systemIds},
    stream=True
)

for line in response.iter_lines():
    if line:
        line = line.decode('utf-8')
        if line.startswith('data: '):
            data = json.loads(line[6:])
            print('Received:', data)

# Using GET
response = requests.get(
    f'http://localhost:4015/stream?systemIds={",".join(systemIds)}',
    stream=True
)

for line in response.iter_lines():
    if line:
        line = line.decode('utf-8')
        if line.startswith('data: '):
            data = json.loads(line[6:])
            print('Received:', data)
```

### cURL

```bash
# POST request
curl -N -X POST http://localhost:4015/stream \
  -H "Content-Type: application/json" \
  -d '{"systemIds": ["VEHICLE_001", "VEHICLE_002"]}'

# GET request
curl -N "http://localhost:4015/stream?systemIds=VEHICLE_001,VEHICLE_002"
```

## Data Format

Each SSE message contains an object with system IDs as keys:

```json
{
  "VEHICLE_001": {
    "systemId": "VEHICLE_001",
    "timestamp": "2026-03-13T10:30:00Z",
    "latitude": "28.5355",
    "longitude": "77.3910",
    "latitudeDirection": "N",
    "longitudeDirection": "E",
    "gpsFixValue": "3",
    "gpsSignalStrength": "4",
    "gpsStatus": "A",
    "frontPressureLvl": "32",
    "rearPressureLvl": "34",
    "ignitionStatus": "1",
    "liveOdo": "1234.5",
    "batterySoc": "85",
    "rideMode": "ECO",
    "vehicleModeLvl1": "4",
    "vehicleModeLvl2": "1",
    "vehicleModeLvl3": "0",
    "vehicleStatus": "Riding"
  },
  "VEHICLE_002": {
    "systemId": "VEHICLE_002",
    ...
  }
}
```

## Vehicle Status Logic

### Vehicle Status
1. **Riding**: `vehicleModeLvl1 == "4"`
2. **Locked**: `vehicleModeLvl3` in `["1", "4", "6"]`
3. **Parked**: `vehicleModeLvl2 == "12"`
4. **Unlocked**: Default case

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `KAFKA_BROKER` | Kafka broker address | Required |
| `INPUT_TOPIC` | Kafka topic to consume | Required |
| `KAFKA_GROUP_ID` | Consumer group ID | `vehicle-tracking-sse-group` |
| `PORT` | Server port | `4015` |

## Architecture

```
┌─────────────┐         ┌──────────────────────┐         ┌─────────────┐
│   Kafka     │────────▶│  Vehicle Tracking    │────────▶│   Client    │
│   Topic     │         │   SSE Service        │   SSE   │   (Browser) │
└─────────────┘         └──────────────────────┘         └─────────────┘
                               │
                               │ Stores latest
                               ▼
                        ┌──────────────┐
                        │  In-Memory   │
                        │  Telemetry   │
                        │  Data Store  │
                        └──────────────┘
```

## Notes

- Service maintains latest telemetry data for each vehicle in memory
- Multiple clients can track the same vehicles simultaneously
- When new data arrives for any tracked vehicle, all clients monitoring that vehicle receive an update
- Initial connection sends the latest available data for requested vehicles
- Handles both event types (3101 for GPS, 6500 for vehicle data) and merges them per vehicle

## License

ISC

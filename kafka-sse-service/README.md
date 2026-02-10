# kafka-sse-service

Consumes messages from a Kafka topic and exposes them as a Server-Sent Events (SSE) stream.

## Environment variables

- `KAFKA_BROKER` (required) e.g. `localhost:9092`
- `INPUT_TOPIC` (required) Kafka topic to consume from
- `PORT` (optional) default `3000`
- `KAFKA_GROUP_ID` (optional) default `kafka-sse-group`
- `FROM_BEGINNING` (optional) `true|false`, default `false`

## Run locally

```bash
npm install
npm start
```

## SSE endpoint

- `GET /events` streams Kafka messages
- `GET /health` returns service health

Example:

```bash
curl -N http://localhost:3000/events
```

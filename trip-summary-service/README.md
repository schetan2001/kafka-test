# Trip Summary Service

A simple Node.js GraphQL service for trip summary and last parked location queries.

## Endpoints

- **/graphql** (POST/GET)
  - Requires `x-api-key` header (see .env for value)
  - Accepts `x-environment` header (not used yet)

## Queries

### tripSummary
```
query {
  tripSummary(systemId: "oLBXCriTeIvhISAbXP-_1", startDate: 1700000000000, endDate: 1701000000000, offset: 0, limit: 10)
}
```
- Only `systemId` is mandatory. Others are optional.
- Returns the raw response from the upstream GraphQL API.

### lastParkedLocation
```
query {
  lastParkedLocation(systemId: "oLBXCriTeIvhISAbXP-_1")
}
```
- Returns the raw response from the upstream REST API.

## Setup

1. `npm install`
2. Copy `.env` and set API keys if needed
3. `node index.js`

## Notes
- The service proxies requests and returns the upstream response as-is.
- `x-environment` header is accepted but not used yet.

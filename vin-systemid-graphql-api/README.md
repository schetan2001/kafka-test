# vin-systemid-graphql-api

GraphQL API that resolves `systemId` for a list of VINs by looking them up in the
`provision_detail` MongoDB collection (`_id` -> systemId, `vin` -> VIN).

## Setup

```
npm install
cp .env.example .env   # fill in MONGO_URI and API_KEY
npm start
```

## Query

```graphql
query {
  getSystemIds(vins: ["VIN1", "VIN2"]) {
    vin
    systemId
  }
}
```

Requests must include header `x-api-key: <API_KEY>`.

VINs not found in the collection are returned with `systemId: null`. Up to 500
VINs per request.

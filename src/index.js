require('dotenv').config();

const express = require('express');
const { graphqlHTTP } = require('express-graphql');
const cors = require('cors');

const schema = require('./schema/typeDefs');
const resolvers = require('./schema/resolvers');

const app = express();
const PORT = process.env.PORT || 4000;
const INGRESS_API_KEY = process.env.API_KEY;
// ── Middleware ────────────────────────────────────────────────────
app.use(cors());

// ── Health check ─────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── GraphQL endpoint ─────────────────────────────────────────────
app.use(
    '/dtc',
    (req, res, next) => {
        const apiKey = req.headers["x-api-key"];
        if (!apiKey || apiKey !== INGRESS_API_KEY) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        next();
    },
    graphqlHTTP({
        schema,
        rootValue: resolvers,
        graphiql: true,
    })
);

// ── Start server ─────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 GraphQL API running on PORT: ${PORT}`);
});

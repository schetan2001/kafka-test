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
const authMiddleware = (req, res, next) => {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey || apiKey !== INGRESS_API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
};

app.use(
    '/dtc',
    authMiddleware,
    graphqlHTTP({
        schema,
        rootValue: resolvers,
        graphiql: true,
    })
);

app.use(
    '/alert-template',
    authMiddleware,
    graphqlHTTP({
        schema: require('./schema/templateTypeDefs'),
        rootValue: require('./schema/templateResolvers'),
        graphiql: true,
    })
);

// ── Start server ─────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 GraphQL API running on PORT: ${PORT}`);
});

const express = require("express");
const cors = require("cors");
const { graphqlHTTP } = require("express-graphql");

const schema    = require("./graphql/schema");
const resolvers = require("./graphql/resolvers");

const app = express();

app.use(express.json());
app.use(cors());

const API_KEY = process.env.API_KEY;

const authenticate = (req, res, next) => {
  const key = req.headers["x-api-key"];
  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

app.use(
  "/eol",
  authenticate,
  graphqlHTTP({
    schema,
    rootValue: resolvers,
    graphiql: true,
  })
);

app.get("/health", (_req, res) => res.json({ status: "healthy" }));

module.exports = app;

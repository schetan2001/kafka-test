require("dotenv").config();
const { ApolloServer, gql } = require("apollo-server");
const axios = require("axios");
const GraphQLJSON = require("graphql-type-json");
const curlconverter = require('curlconverter'); // npm install curlconverter

const { CURL_STRING, SERVER_PORT } = process.env;

function parseCurl(curl) {
  try {
    const parsed = curlconverter.toJson(curl);
    const { url, headers } = parsed;
    return { url, headers };
  } catch (err) {
    throw new Error("Invalid cURL string");
  }
}

const typeDefs = gql`
  scalar JSON

  type Query {
    callRest: JSON
  }
`;

const resolvers = {
  JSON: GraphQLJSON,
  Query: {
    callRest: async () => {
      try {
        const { url, headers } = parseCurl(CURL_STRING);
        const res = await axios.get(url, { headers });
        return { payload: res.data };
      } catch (err) {
        return {
          payload: { error: true, message: err.message }
        };
      }
    }
  }
};

const server = new ApolloServer({ typeDefs, resolvers });

const PORT = SERVER_PORT || 4000;

server.listen(PORT, '0.0.0.0', () =>
  console.log(`GraphQL server ready at http://localhost:${PORT}`)
);
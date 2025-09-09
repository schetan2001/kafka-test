require("dotenv").config();
const { Kafka } = require("kafkajs");
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { ApolloServerPluginDrainHttpServer } = require('@apollo/server/plugin/drainHttpServer');
const { PubSub } = require("graphql-subscriptions");
const express = require('express');
const http = require('http');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { WebSocketServer } = require('ws');
const { useServer } = require('graphql-ws/lib/use/ws');
const { GraphQLJSON } = require('graphql-type-json');

const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";
const KAFKA_TOPIC = process.env.KAFKA_TOPIC;
const SERVER_PORT = process.env.SERVER_PORT || 4000;

const pubsub = new PubSub();

// ===== Kafka setup =====
const kafka = new Kafka({
  clientId: "graphql-kafka-subscription",
  brokers: [KAFKA_BROKER]
});

const consumer = kafka.consumer({ groupId: "graphql-kafka-subscription-group" });

async function startKafkaConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const payload = JSON.parse(message.value.toString());
        pubsub.publish("KAFKA_DATA", payload);
      } catch (err) {
        console.error("Invalid Kafka message:", err.message);
      }
    }
  });
}

// ===== GraphQL setup =====
const typeDefs = `
  scalar JSON

  type Query {
    hello: String
  }

  type Subscription {
    kafkaData: JSON
  }
`;

const resolvers = {
  JSON: GraphQLJSON,
  Query: {
    hello: () => "Hello world!",
  },
  Subscription: {
    kafkaData: {
      subscribe: () => pubsub.asyncIterator(["KAFKA_DATA"]),
    },
  },
};

// Create schema, which will be passed to GraphQL WS and Apollo Server
const schema = makeExecutableSchema({ typeDefs, resolvers });

// Create an Express app and HTTP server;
const app = express();
const httpServer = http.createServer(app);

// Set up WebSocket server using the schema
const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/',
});

useServer({ schema }, wsServer);

// Set up Apollo Server
const server = new ApolloServer({
  schema,
  plugins: [
    // Proper shutdown for the HTTP server.
    ApolloServerPluginDrainHttpServer({ httpServer }),
  ],
});

// Start the server
async function startApolloServer() {
  await server.start();
  app.use('/', express.json(), expressMiddleware(server));

  httpServer.listen(SERVER_PORT, () => {
    console.log(`Server is running on port ${SERVER_PORT}`);
    startKafkaConsumer().catch(console.error);
  });
}

startApolloServer();
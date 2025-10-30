require("dotenv").config();
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { ApolloServerPluginDrainHttpServer } = require('@apollo/server/plugin/drainHttpServer');
const { PubSub } = require("graphql-subscriptions");
const express = require('express');
const http = require('http');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { WebSocketServer } = require('ws');
const { useServer } = require('graphql-ws/lib/use/ws');
const { Client } = require('pg');
const PGListen = require('pg-listen')

const POSTGRES_HOST = process.env.POSTGRES_HOST || "localhost";
const POSTGRES_PORT = process.env.POSTGRES_PORT || 5432;
const POSTGRES_USER = process.env.POSTGRES_USER;
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD;
const POSTGRES_DB = process.env.POSTGRES_DB;
const SERVER_PORT = process.env.SERVER_PORT || 4000;

const pubsub = new PubSub();

// ===== PostgreSQL setup =====
const dbConfig = {
  host: POSTGRES_HOST,
  port: POSTGRES_PORT,
  user: POSTGRES_USER,
  password: POSTGRES_PASSWORD,
  database: POSTGRES_DB,
};

const client = new Client(dbConfig);

async function startPgListener() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    const listener = new PGListen(dbConfig);
    await listener.connect();
    console.log('Listening for PostgreSQL notifications');

    listener.listenTo('my_table_updates');

    listener.on('notification', (notification) => {
      console.log('Received notification:', notification);
      pubsub.publish('POSTGRES_DATA', { postgresData: JSON.parse(notification.payload) });
    });

    listener.on('error', (error) => {
      console.error('PostgreSQL listener error:', error);
    });

    await listener.waitForListen();
  } catch (err) {
    console.error("Error connecting to PostgreSQL:", err.message);
  }
}

// ===== GraphQL setup =====
const typeDefs = `
  type DataType {
    id: Int
    name: String
    value: String
  }

  type Query {
    hello: String
  }

  type Subscription {
    postgresData: DataType
  }
`;

const resolvers = {
  Query: {
    hello: () => "Hello world!",
  },
  Subscription: {
    postgresData: {
      subscribe: () => pubsub.asyncIterator(["POSTGRES_DATA"]),
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
    startPgListener().catch(console.error);
  });
}

startApolloServer();
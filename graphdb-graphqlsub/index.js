require("dotenv").config();
const express = require('express');
const http = require('http');
const { buildSchema } = require('graphql');
const { graphqlHTTP } = require('express-graphql');
const { PubSub } = require("graphql-subscriptions");
const { WebSocketServer } = require('ws');
const { useServer } = require('graphql-ws/lib/use/ws');
const { GraphQLJSON } = require('graphql-type-json');
const neo4j = require('neo4j-driver');
const { Kafka } = require('kafkajs');

const SERVER_PORT = process.env.SERVER_PORT || 4000;
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';
const KAFKA_BROKER = process.env.KAFKA_BROKER || 'localhost:9092';
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'my-topic';

const pubsub = new PubSub();

// ===== Neo4j setup =====
const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
const session = driver.session();

// ===== Kafka setup =====
const kafka = new Kafka({
  clientId: 'graphql-kafka-neo4j',
  brokers: [KAFKA_BROKER]
});

const consumer = kafka.consumer({ groupId: 'graphql-kafka-neo4j-group' });

async function startKafkaConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const payload = JSON.parse(message.value.toString());
        // Store the payload in Neo4j
        const newNode = await createNodeInNeo4j(payload);
        if (newNode) {
          pubsub.publish("NODE_CREATED", { nodeCreated: newNode });
        }
      } catch (error) {
        console.error("Error processing Kafka message:", error);
      }
    },
  });
}

async function createNodeInNeo4j(payload) {
  try {
    const result = await session.writeTransaction(tx =>
      tx.run(
        `CREATE (n:KafkaNode {payload: $payload}) RETURN n`,
        { payload: payload }
      )
    );

    if (result.records.length > 0) {
      const node = result.records[0].get('n');
      return {
        id: node.identity.toString(),
        label: node.labels[0],
        properties: node.properties
      };
    }
    return null;
  } catch (error) {
    console.error("Error creating node in Neo4j:", error);
    return null;
  }
}

// ===== GraphQL setup =====
const schema = buildSchema(`
  scalar JSON

  type Node {
    id: ID!
    label: String
    properties: JSON
  }

  type Query {
    hello: String
    getNode(id: ID!): Node
  }

  type Subscription {
    nodeCreated: Node
  }
`);

const rootValue = {
  JSON: GraphQLJSON,
  Query: {
    hello: () => "Hello world!",
    getNode: async (args) => {
      try {
        const result = await session.readTransaction(tx =>
          tx.run('MATCH (n) WHERE id(n) = $id RETURN n', { id: parseInt(args.id) })
        );

        if (result.records.length > 0) {
          const node = result.records[0].get('n');
          return {
            id: node.identity.toString(),
            label: node.labels[0],
            properties: node.properties
          };
        } else {
          return null;
        }
      } catch (error) {
        console.error("Error fetching node:", error);
        return null;
      }
    }
  },
  Subscription: {
    nodeCreated: {
      subscribe: () => pubsub.asyncIterator(["NODE_CREATED"]),
    },
  },
};

const app = express();
const httpServer = http.createServer(app);

const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/graphql', // Important:  Match the graphql endpoint
});

useServer({ schema, rootValue }, wsServer);

app.use('/graphql', graphqlHTTP({
  schema: schema,
  rootValue: rootValue,
  graphiql: true,
}));

httpServer.listen(SERVER_PORT, () => {
  console.log(`Server is running on port ${SERVER_PORT}`);
  startKafkaConsumer().catch(console.error); // Start Kafka consumer
});
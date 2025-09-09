require("dotenv").config();
const { Kafka } = require("kafkajs");
const { ApolloServer, gql } = require("apollo-server");
const { PubSub } = require("graphql-subscriptions");

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
        pubsub.publish("KAFKA_DATA", { kafkaData: payload });
      } catch (err) {
        console.error("Invalid Kafka message:", err.message);
      }
    }
  });
}

// ===== GraphQL setup =====
const typeDefs = gql`
  type KafkaDataType {
    message: String
  }

  type Query {
    hello: String
  }

  type Subscription {
    kafkaData: KafkaDataType
  }
`;

const resolvers = {
  Query: {
    hello: () => "Hello world!",
  },
  Subscription: {
    kafkaData: {
      subscribe: () => pubsub.asyncIterator(["KAFKA_DATA"]),
    },
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

// Start the server
server.listen(SERVER_PORT).then(({ url }) => {
  console.log(` Server ready at ${url}`);
  startKafkaConsumer().catch(console.error);
});
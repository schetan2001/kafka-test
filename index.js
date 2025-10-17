require("dotenv").config();
const { Kafka } = require("kafkajs");

const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";
const SOURCE_TOPIC = process.env.SOURCE_TOPIC || "source-topic";
const DESTINATION_TOPIC = process.env.DESTINATION_TOPIC || "destination-topic";

// Kafka setup
const kafka = new Kafka({
  clientId: "csv-to-json-processor",
  brokers: [KAFKA_BROKER],
});

const consumer = kafka.consumer({ groupId: "csv-to-json-group" });
const producer = kafka.producer();

const csvToJson = (csv, keys) => {
  const values = csv.split(",");
  if (values.length !== keys.length) {
    console.error("CSV length does not match keys length");
    return null;
  }

  const json = {};
  for (let i = 0; i < keys.length; i++) {
    json[keys[i]] = values[i];
  }
  return json;
};

const startKafkaProcessing = async () => {
  try {
    await consumer.connect();
    await producer.connect();
    await consumer.subscribe({ topic: SOURCE_TOPIC, fromBeginning: true });

    const keys = [
      "Start Character",
      "Header",
      "Firmware Version",
      "Config Version",
      "Protocol Version",
      "Packet Type",
      "Alert ID",
      "Packet Status",
      "IMEI",
      "GPS Fix",
      "Date",
      "Time",
      "Latitude",
      "Latitude Dir",
      "Longitude",
      "Longitude Dir",
      "Speed",
      "Heading",
      "No of Satellites",
      "Altitude",
      "PDOP",
      "HDOP",
      "Network Operator Name",
      "Ignition Status",
      "Main Input Voltage",
      "GSM Signal Strength",
      "GPRS Status",
      "Frame Number",
      "Delta Distance",
      "OBD Data",
      "Active DTC Codes",
      "History DTC Codes",
      "VIN Number",
      "Trip ID",
      "ECU Type",
      "Calibration ID",
      "End Character",
      "Checksum",
    ];

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const csv = message.value.toString();
        const json = csvToJson(csv, keys);

        if (json) {
          await producer.send({
            topic: DESTINATION_TOPIC,
            messages: [{ value: JSON.stringify(json) }],
          });
          console.log(`Produced message to ${DESTINATION_TOPIC}: ${JSON.stringify(json)}`);
        }
      },
    });
  } catch (error) {
    console.error("Error in Kafka processing:", error);
  }
};

startKafkaProcessing().catch(console.error);
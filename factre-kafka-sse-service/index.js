const express = require('express');
const { Kafka } = require('kafkajs');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Kafka Configuration
const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'factre-kafka-sse-service',
  brokers: (process.env.KAFKA_BROKER || 'localhost:9092').split(',')
});

const consumer = kafka.consumer({ 
  groupId: process.env.KAFKA_GROUP_ID || 'factre-sse-consumer-group' 
});

const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'telemetry-topic';
const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT || 'https://cbpuat-in-api.royalenfield.com/ffmech/core/v1/graphql';
const CONNECTION_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds


const activeConnections = new Map();

// GraphQL query to get systemId from VIN
async function getSystemIdByVin(vin) {
  const query = `
    query GetVehicleMetadataByVin {
      getVehicleMetadataByVin(vin: "${vin}") {
        success
        message
        errorCode
        data {
          systemId
          vin
          status
          imei
          iccid
          model
          variant
        }
      }
    }
  `;

  try {
    const response = await axios.post(GRAPHQL_ENDPOINT, {
      query: query
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const result = response.data?.data?.getVehicleMetadataByVin;
    
    if (result?.success && result?.data?.systemId) {
      return result.data.systemId;
    } else {
      throw new Error(result?.message || 'Failed to fetch systemId');
    }
  } catch (error) {
    console.error('Error fetching systemId:', error.message);
    throw error;
  }
}

// Initialize Kafka consumer
async function initKafkaConsumer() {
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const value = message.value.toString();
        const kafkaMessage = JSON.parse(value);
        
        const systemId = kafkaMessage?.meta?.system_id;
        
        if (!systemId) {
          return;
        }

        // Send to all active connections that match this systemId
        for (const [res, connData] of activeConnections.entries()) {
          if (connData.systemId === systemId) {
            try {
              res.write(`data: ${value}\n\n`);
            } catch (err) {
              console.error('Error writing to SSE connection:', err.message);
              clearTimeout(connData.timeout);
              activeConnections.delete(res);
            }
          }
        }
      } catch (error) {
        console.error('Error processing Kafka message:', error.message);
      }
    }
  });

  console.log(`Kafka consumer connected and subscribed to topic: ${KAFKA_TOPIC}`);
}

// SSE endpoint
app.get('/stream/:vin', async (req, res) => {
  const { vin } = req.params;

  if (!vin) {
    return res.status(400).json({ error: 'VIN is required' });
  }

  try {
    // Get systemId for the VIN
    console.log(`Fetching systemId for VIN: ${vin}`);
    const systemId = await getSystemIdByVin(vin);
    console.log(`SystemId for VIN ${vin}: ${systemId}`);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ 
      status: 'connected', 
      vin: vin, 
      systemId: systemId,
      timestamp: new Date().toISOString()
    })}\n\n`);

    const timeout = setTimeout(() => {
      console.log(`Connection timeout for VIN: ${vin}, SystemId: ${systemId}`);
      try {
        res.write(`data: ${JSON.stringify({ 
          status: 'timeout', 
          message: 'Connection closed due to inactivity (30 minutes)',
          timestamp: new Date().toISOString()
        })}\n\n`);
        res.end();
      } catch (err) {
        console.error('Error closing timed-out connection:', err.message);
      }
      activeConnections.delete(res);
    }, CONNECTION_TIMEOUT);

    // Add this connection to active connections
    activeConnections.set(res, { systemId, timeout });
    console.log(`Active SSE connection for VIN: ${vin}, SystemId: ${systemId}`);

    // Handle client disconnect
    req.on('close', () => {
      const connData = activeConnections.get(res);
      if (connData) {
        clearTimeout(connData.timeout);
        activeConnections.delete(res);
      }
      activeConnections.delete(res);
      console.log(`Client disconnected for VIN: ${vin}`);
    });

  } catch (error) {
    console.error(`Error in SSE endpoint for VIN ${vin}:`, error.message);
    res.status(500).json({ 
      error: 'Failed to establish SSE connection', 
      message: error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    activeConnections: activeConnections.size,
    timestamp: new Date().toISOString()
  });
});

// Start server
async function start() {
  try {
    await initKafkaConsumer();
    
    app.listen(PORT, () => {
      console.log(`Factre Kafka SSE Service running on port ${PORT}`);
      console.log(`SSE endpoint: http://localhost:${PORT}/stream/:vin`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start service:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await consumer.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await consumer.disconnect();
  process.exit(0);
});

start();

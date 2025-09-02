require('dotenv').config();
const redis = require('redis');
const express = require('express');

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const ALERT_ID = process.env.ALERT_ID;
const MESSAGE = process.env.MESSAGE;

const redisClient = redis.createClient({
  host: REDIS_HOST,
  port: REDIS_PORT
});

redisClient.on('connect', () => console.log('Connected to Redis'));
redisClient.on('error', (err) => console.log('Redis Client Error', err));

const app = express();
app.use(express.json());

// Middleware to ensure Redis is connected
app.use(async (req, res, next) => {
  if (!redisClient.isReady) {
    try {
      await redisClient.connect();
      console.log('Redis reconnected');
    } catch (err) {
      console.error('Failed to reconnect to Redis:', err);
      return res.status(500).send('Redis connection error');
    }
  }
  next();
});

// Update/Create template
app.get("/templates", async (req, res) => {
  if (!ALERT_ID || !MESSAGE) {
    return res
      .status(500)
      .send("ALERT_ID and MESSAGE environment variables are required");
  }

  try {
    await redisClient.set(ALERT_ID, JSON.stringify({ message: MESSAGE }));
    console.log(`Redis SET response for ${ALERT_ID}:`, { message: MESSAGE });
    res.send(`Template for alert ${ALERT_ID} saved/updated`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving/updating template");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
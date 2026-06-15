const Redis = require("ioredis");

const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_AUTH_KEY,
  tls: process.env.REDIS_TLS === "true" ? {} : undefined,
  retryStrategy(times) {
    return Math.min(times * 200, 5000);
  },
});

redis.on("connect", () => console.log("Redis connected"));
redis.on("error", (err) => console.error("Redis error:", err.message));

module.exports = redis;

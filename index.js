const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(express.json());

const INGRESS_API_KEY = process.env.API_KEY;
const CURL1 = process.env.CURL1;
const CURL2 = process.env.CURL2;
const CURL3 = process.env.CURL3;
const CURL4 = process.env.CURL4;
const CURL5 = process.env.CURL5;
const KEYS1 = process.env.KEYS1;
const KEYS2 = process.env.KEYS2;
const KEYS3 = process.env.KEYS3;
const KEYS4 = process.env.KEYS4;
const KEYS5 = process.env.KEYS5;

async function parseCurl(curl) {
  try {
    console.log("curl ", curl);
    const curlconverter = await import("curlconverter");
    const parsed = curlconverter.toJsonObject(curl);
    const { raw_url, headers } = parsed;
    return { url: raw_url, headers };
  } catch (err) {
    console.log("error", err);
    throw new Error("Invalid cURL string");
  }
}

app.use((req, res, next) => {
  const clientKey = req.headers["x-api-key"];
  if (!clientKey || clientKey !== INGRESS_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

app.get("/connect", async (req, res) => {
  try {
    const apiConfigs = [
      { curl: CURL1, keys: KEYS1, name: "API1" },
      { curl: CURL2, keys: KEYS2, name: "API2" },
      { curl: CURL3, keys: KEYS3, name: "API3" },
      { curl: CURL4, keys: KEYS4, name: "API4" },
      { curl: CURL5, keys: KEYS5, name: "API5" },
    ];

    const results = [];

    for (const apiConfig of apiConfigs) {
      if (apiConfig.curl) {
        try {
          const { url, headers } = await parseCurl(apiConfig.curl);
          const API_KEYS = apiConfig.keys ? apiConfig.keys.split(",").map(k => k.trim()) : [];

          const response = await axios.get(url, { headers });

          let extractedData = [];

          if (Array.isArray(response.data)) {
            extractedData = response.data.map(item => {
              const extracted = {};
              API_KEYS.forEach(key => {
                extracted[key] = getValue(item, key);
              });
              return extracted;
            });
          } else if (typeof response.data === 'object' && response.data !== null) {
            const extracted = {};
            API_KEYS.forEach(key => {
              extracted[key] = getValue(response.data, key);
            });
            extractedData.push(extracted);
          }

          results.push({ service: apiConfig.name, data: extractedData });
        } catch (error) {
          results.push({ service: apiConfig.name, error: error.message });
        }
      }
    }

    res.json(results);
  } catch (error) {
    console.error("Aggregation error:", error);
    res.status(500).json({ error: "Aggregation failed" });
  }
});

function getValue(obj, key) {
  const keys = key.split('.');
  let value = obj;
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return undefined; // Property not found
    }
  }
  return value;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
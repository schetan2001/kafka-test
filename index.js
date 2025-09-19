const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(express.json());

const INGRESS_API_KEY = process.env.API_KEY;

const API_CONFIGS = [
  { curl: process.env.CURL1, keys: process.env.KEYS1, path: process.env.PATH1, name: "service1" },
  { curl: process.env.CURL2, keys: process.env.KEYS2, path: process.env.PATH2, name: "service2" },
  { curl: process.env.CURL3, keys: process.env.KEYS3, path: process.env.PATH3, name: "service3" },
  { curl: process.env.CURL4, keys: process.env.KEYS4, path: process.env.PATH4, name: "service4" },
  { curl: process.env.CURL5, keys: process.env.KEYS5, path: process.env.PATH5, name: "service5" }
];

async function parseCurl(curl) {
  try {
    const curlconverter = await import('curlconverter');
    const parsed = curlconverter.toJsonObject(curl);
    const { raw_url, headers } = parsed;
    return { url: raw_url, headers };
  } catch (err) {
    throw new Error("Invalid cURL string");
  }
}

function getNestedValue(obj, path) {
  if (!path) return obj;
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
}

app.use((req, res, next) => {
  const clientKey = req.headers["x-api-key"];
  if (!clientKey || clientKey !== INGRESS_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

app.get("/aggregate", async (req, res) => {
  try {
    const validConfigs = [];

    for (let i = 0; i < API_CONFIGS.length; i++) {
      const config = API_CONFIGS[i];
      if (config.curl && (!config.keys || !config.path)) {
        return res.status(500).json({ error: `CURL${i + 1} is provided, but KEYS${i + 1} or PATH${i + 1} is missing.` });
      }
      if (config.curl && config.keys && config.path) {
        validConfigs.push(config);
      }
    }

    if (validConfigs.length === 0) {
      return res.status(500).json({ error: "At least one CURL, KEYS, and PATH trio must be provided." });
    }

    const requests = validConfigs.map(async (config) => {
      try {
        const { url, headers } = await parseCurl(config.curl);
        const response = await axios.get(url, { headers });
        return { data: response.data, config };
      } catch (e) {
        console.error(`Error fetching data for ${config.name}:`, e.message);
        return { error: e.message, config };
      }
    });

    const responses = await Promise.all(requests);

    const results = {};
    responses.forEach((response) => {
      const { data, config } = response;
      if (data.error) {
        results[config.name] = { error: data.error };
        return;
      }
      
      const keys = config.keys.split(",").map(k => k.trim());
      const extractedData = [];

      const dataToExtract = getNestedValue(data, config.path);

      if (Array.isArray(dataToExtract)) {
          dataToExtract.forEach(item => {
              const extracted = {};
              keys.forEach(key => {
                  if (item.hasOwnProperty(key)) {
                      extracted[key] = item[key];
                  }
              });
              extractedData.push(extracted);
          });
      } else {
        console.warn(`Path '${config.path}' did not lead to an array for ${config.name}.`);
        results[config.name] = { data: dataToExtract, message: "Path did not lead to an array." };
        return;
      }

      results[config.name] = extractedData;
    });

    res.json(results);

  } catch (err) {
    console.error("Internal error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Ingress listening on port ${PORT}`);
});

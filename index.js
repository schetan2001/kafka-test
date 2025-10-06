const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const cors = require("cors"); // Import the cors middleware

dotenv.config();

const app = express();
app.use(express.json());

const corsOptions = {
  origin: [
    "https://tap-sit.royalenfield.com",
    "http://localhost:3000",
    "http://localhost:3001",
  ],
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
};

app.use(cors(corsOptions));

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

// Function to get a nested value from an object using a dot-separated path.
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
    const validConfigs = API_CONFIGS.filter(config => config.curl && config.keys && config.path);

    if (validConfigs.length === 0) {
      return res.status(500).json({ error: "At least one CURL, KEYS, and PATH trio must be provided." });
    }

    const requests = validConfigs.map(async (config) => {
      try {
        const { url: baseUrl, headers } = await parseCurl(config.curl);
        
        const dynamicUrl = new URL(baseUrl);
        for (const key in req.query) {
          dynamicUrl.searchParams.set(key, req.query[key]);
        }

        const response = await axios.get(dynamicUrl.toString(), { headers });
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
      if (response.error) {
        results[config.name] = { error: response.error };
        return;
      }
      
      const pathSegments = config.path.split(' - ').map(p => p.trim());
      const keyGroups = config.keys.split(' - ').map(k => k.trim());
      
      if (pathSegments.length !== keyGroups.length) {
          results[config.name] = { error: "Mismatched number of path segments and key groups." };
          return;
      }

      const extractedData = {};
      
      // Iterate through each hyphen-separated path and key group.
      pathSegments.forEach((pathSegment, index) => {
        const keysToExtract = keyGroups[index].split(',').map(k => k.trim());
        const dataToExtract = getNestedValue(data, pathSegment);
        
        // Handle both objects and arrays at the nested path.
        if (Array.isArray(dataToExtract)) {
          extractedData[pathSegment] = dataToExtract.map(item => {
              const extracted = {};
              keysToExtract.forEach(key => {
                if (item.hasOwnProperty(key)) {
                  extracted[key] = item[key];
                }
              });
              return extracted;
          });
        } else if (typeof dataToExtract === 'object' && dataToExtract !== null) {
          const extracted = {};
          keysToExtract.forEach(key => {
            if (dataToExtract.hasOwnProperty(key)) {
              extracted[key] = dataToExtract[key];
            }
          });
          extractedData[pathSegment] = extracted;
        } else {
            console.warn(`Path '${pathSegment}' did not lead to a valid object or array for ${config.name}.`);
            extractedData[pathSegment] = dataToExtract;
        }
      });
      
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

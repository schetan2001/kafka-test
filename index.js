const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");
const cors = require("cors");
const { searchInData } = require('./utils');

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
  {
    curl: process.env.CURL1,
    keys: process.env.KEYS1,
    path: process.env.PATH1,
    name: "service1",
    enableSearch: process.env.ENABLE_SEARCH1 === "1",
  },
  {
    curl: process.env.CURL2,
    keys: process.env.KEYS2,
    path: process.env.PATH2,
    name: "service2",
    enableSearch: process.env.ENABLE_SEARCH2 === "1",
  },
  {
    curl: process.env.CURL3,
    keys: process.env.KEYS3,
    path: process.env.PATH3,
    name: "service3",
    enableSearch: process.env.ENABLE_SEARCH3 === "1",
  },
  {
    curl: process.env.CURL4,
    keys: process.env.KEYS4,
    path: process.env.PATH4,
    name: "service4",
    enableSearch: process.env.ENABLE_SEARCH4 === "1",
  },
  {
    curl: process.env.CURL5,
    keys: process.env.KEYS5,
    path: process.env.PATH5,
    name: "service5",
    enableSearch: process.env.ENABLE_SEARCH5 === "1",
  },
];

async function getTotalRecords(baseUrl, headers) {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set('pageNo', '1');
    url.searchParams.set('pageSize', '5');

    const response = await axios.get(url.toString(), {
      headers,
      timeout: 10000
    });

    if (!response.data?.responseData?.totalRecords) {
      throw new Error('Total records not found in response');
    }

    return response.data.responseData.totalRecords;
  } catch (error) {
    console.error('Error fetching total records:', {
      message: error.message,
      url: baseUrl,
      response: error.response?.data
    });
    throw error;
  }
}

async function parseCurl(curl) {
  try {
    const curlconverter = await import("curlconverter");
    const parsed = curlconverter.toJsonObject(curl);
    const { raw_url, headers } = parsed;
    return { url: raw_url, headers };
  } catch (err) {
    throw new Error("Invalid cURL string");
  }
}

// Helper function to set a nested value based on a dot-separated path.
function setNestedValue(obj, path, value) {
  if (!path || typeof path !== "string") return obj;

  const parts = path.split(".");
  let current = obj;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i === parts.length - 1) {
      current[part] = value;
    } else {
      if (
        !current[part] ||
        typeof current[part] !== "object" ||
        Array.isArray(current[part])
      ) {
        current[part] = {};
      }
      current = current[part];
    }
  }
  return obj;
}

function getNestedValue(obj, path) {
  if (!path) return obj;
  return path.split(".").reduce((acc, part) => acc && acc[part], obj);
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
    const searchQuery = req.query.search;

    const requests = validConfigs.map(async (config) => {
      try {
        const { url: baseUrl, headers } = await parseCurl(config.curl);
        let dynamicUrl = new URL(baseUrl);

        if (config.enableSearch && searchQuery) {
          // Get total records and handle errors
          let totalRecords;
          try {
            totalRecords = await getTotalRecords(baseUrl, headers);
          } catch (error) {
            console.error(`Failed to get total records for ${config.name}:`, error.message);
            throw new Error('Failed to fetch total records');
          }

          // Update URL with total records as page size
          dynamicUrl.searchParams.set('pageNo', '1');
          dynamicUrl.searchParams.set('pageSize', totalRecords.toString());
        } else {
          // For non-search requests, use query params from request
          for (const [key, value] of Object.entries(req.query)) {
            if (key !== 'search') {
              dynamicUrl.searchParams.set(key, value);
            }
          }
        }

        const response = await axios.get(dynamicUrl.toString(), { 
          headers,
          timeout: 10000
        });
        
        if (config.enableSearch && searchQuery && response.data?.responseData?.vehicleDetails) {
          const searchKeys = config.keys.split(',').map(k => k.trim());
          const filteredData = searchInData(
            response.data.responseData.vehicleDetails,
            searchQuery,
            searchKeys
          );
          
          response.data.responseData.vehicleDetails = filteredData;
          response.data.responseData.totalRecords = filteredData.length;
        }

        return { data: response.data, config };
      } catch (e) {
        console.error(`Error in ${config.name}:`, {
          message: e.message,
          stack: e.stack,
          config: config.name
        });
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

      const pathSegments = config.path.split(" - ").map((p) => p.trim());
      const keyGroups = config.keys.split(" - ").map((k) => k.trim());

      if (pathSegments.length !== keyGroups.length) {
        results[config.name] = {
          error: "Mismatched number of path segments and key groups.",
        };
        return;
      }

      const extractedData = {};

      pathSegments.forEach((pathSegment, index) => {
        const keysToExtract = keyGroups[index].split(",").map((k) => k.trim());
        const dataToExtract = getNestedValue(data, pathSegment);

        if (Array.isArray(dataToExtract)) {
          extractedData[pathSegment] = dataToExtract.map((item) => {
            const extracted = {};
            keysToExtract.forEach((key) => {
              if (item.hasOwnProperty(key)) {
                extracted[key] = item[key];
              }
            });
            return extracted;
          });
        } else if (
          typeof dataToExtract === "object" &&
          dataToExtract !== null
        ) {
          const extracted = {};
          keysToExtract.forEach((key) => {
            if (dataToExtract.hasOwnProperty(key)) {
              extracted[key] = dataToExtract[key];
            }
          });
          extractedData[pathSegment] = extracted;
        } else {
          console.warn(
            `Path '${pathSegment}' did not lead to a valid object or array for ${config.name}.`
          );
          extractedData[pathSegment] = dataToExtract;
        }
      });

      const finalStructuredData = {};

      for (const pathKey in extractedData) {
        if (extractedData.hasOwnProperty(pathKey)) {
          setNestedValue(finalStructuredData, pathKey, extractedData[pathKey]);
        }
      }

      results[config.name] = finalStructuredData;
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

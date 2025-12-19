require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const REQUIRED_PROPERTY_IDS = require("./propertyIds");

// --- Configuration ---
const SERVER_PORT = process.env.SERVER_PORT || 4001;
const TELEMETRY_API_BASE_URL = process.env.TELEMETRY_API_BASE_URL;
const TELEMETRY_API_KEY = process.env.TELEMETRY_API_KEY;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

const app = express();
app.use(cors());
app.use(express.json());

const apiKeyValidator = (req, res, next) => {
  const apiKey = req.headers["x-api-key"];

  if (!INTERNAL_API_KEY) {
    return res.status(500).json({ error: "Server configuration error." });
  }

  if (!apiKey || apiKey !== INTERNAL_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
};

app.get("/validate-signals/:systemId", apiKeyValidator, async (req, res) => {
  const { systemId } = req.params;

  if (!systemId) {
    return res.status(400).json({ error: "systemId is required." });
  }

  const apiUrl = `${TELEMETRY_API_BASE_URL}/${systemId}`;
  console.log(`Fetching data for systemId: ${systemId} from ${apiUrl}`);

  try {
    const response = await axios.get(apiUrl, {
      headers: {
        "accept": "*/*",
        "x-requestor": "test",
        "api-key": TELEMETRY_API_KEY,
      },
    });

    const signals = response.data?.responseData?.signals;

    if (!Array.isArray(signals)) {
      console.error("API response did not contain a valid signals array.");
      return res.status(500).json({
        error: "Invalid response format from telemetry API.",
        details: response.data,
      });
    }

    const receivedIds = new Set(signals.map(signal => signal.id));
    const missingIds = [];

    for (const requiredId of REQUIRED_PROPERTY_IDS) {
      if (!receivedIds.has(requiredId)) {
        missingIds.push(requiredId);
      }
    }

    if (missingIds.length === 0) {
      console.log(`Success: All ${REQUIRED_PROPERTY_IDS.size} required signals were found for systemId: ${systemId}.`);
      res.status(200).json({
        status: "Success",
        message: "All required signals were fetched successfully.",
        totalRequired: REQUIRED_PROPERTY_IDS.size,
        totalFetched: receivedIds.size,
      });
    } else {
      res.status(200).json({
        status: "Failure",
        message: "One or more required signals were missing.",
        totalRequired: REQUIRED_PROPERTY_IDS.size,
        totalFetched: receivedIds.size,
        missingPropertyIds: missingIds,
      });
    }
  } catch (error) {
    console.error(`Error fetching data for systemId ${systemId}:`, error.message);
    if (error.response) {
      return res.status(error.response.status).json({
        error: "An error occurred while calling the telemetry API.",
        details: error.response.data,
      });
    }
    return res.status(500).json({
      error: "An internal server error occurred.",
      details: error.message,
    });
  }
});

// --- Server Start ---
app.listen(SERVER_PORT, () => {
  console.log(`Signal Validator server is running on port ${SERVER_PORT}`);
  console.log(`Endpoint: GET /validate-signals/:systemId`);
});
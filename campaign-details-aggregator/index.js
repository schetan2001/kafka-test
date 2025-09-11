const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();
const app = express();
app.use(express.json());

const INGRESS_API_KEY = process.env.API_KEY;
const BACKEND_API1 = process.env.BACKEND_API1;
const BACKEND_API2 = process.env.BACKEND_API2;
const BACKEND_API3 = process.env.BACKEND_API3;

const API1_KEYS = process.env.API1_KEYS.split(",").map(k => k.trim());
const API2_KEYS = process.env.API2_KEYS.split(",").map(k => k.trim());
const API3_KEYS = process.env.API3_KEYS.split(",").map(k => k.trim());

app.use((req, res, next) => {
  const clientKey = req.headers["x-api-key"];
  if (!clientKey || clientKey !== INGRESS_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

app.get("/aggregate", async (req, res) => {
  try {
    const [response1, response2, response3] = await Promise.all([
      axios.get(BACKEND_API1).then(r => r.data).catch(e => ({ error: e.message })),
      axios.get(BACKEND_API2).then(r => r.data).catch(e => ({ error: e.message })),
      axios.get(BACKEND_API3).then(r => r.data).catch(e => ({ error: e.message }))
    ]);

    const extractedData1 = response1.responseData.vehicleDetails.map(item => {
      const extracted = {};
      API1_KEYS.forEach(key => {
        extracted[key] = item[key];
      });
      return extracted;
    });

    const extractedData2 = response2.packages.map(item => {
      const extracted = {};
      API2_KEYS.forEach(key => {
        extracted[key] = item[key];
      });
      return extracted;
    });

    const extractedData3 = response3.preconditions.map(item => {
      const extracted = {};
      API3_KEYS.forEach(key => {
        extracted[key] = item[key];
      });
      return extracted;
    });

    return res.json({
      service1: extractedData1,
      service2: extractedData2,
      service3: extractedData3
    });

  } catch (err) {
    console.error("Internal error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(` Ingress listening on port ${PORT}`);
});
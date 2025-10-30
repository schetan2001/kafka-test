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
const KEYS1 = process.env.KEYS1;
const KEYS2 = process.env.KEYS2;
const KEYS3 = process.env.KEYS3;

async function parseCurl(curl) {
  try {
    console.log("curl ",curl);
    const curlconverter = await import('curlconverter');
    const parsed = curlconverter.toJsonObject(curl);
    const { raw_url, headers } = parsed;
    return { url: raw_url, headers };
  } catch (err) {
    console.log("error",err);
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

app.get("/aggregate", async (req, res) => {
  try {
    if (!CURL1 || !CURL2 || !CURL3 || !KEYS1 || !KEYS2 || !KEYS3) {
      return res.status(500).json({ error: "Missing cURL or keys environment variables" });
    }

    const API1_KEYS = KEYS1.split(",").map(k => k.trim());
    const API2_KEYS = KEYS2.split(",").map(k => k.trim());
    const API3_KEYS = KEYS3.split(",").map(k => k.trim());

    const { url: BACKEND_API1, headers: headers1 } = await parseCurl(CURL1);
    const { url: BACKEND_API2, headers: headers2 } = await parseCurl(CURL2);
    const { url: BACKEND_API3, headers: headers3 } = await parseCurl(CURL3);

    const [response1, response2, response3] = await Promise.all([
      axios.get(BACKEND_API1, { headers: headers1 }).then(r => r.data).catch(e => ({ error: e.message })),
      axios.get(BACKEND_API2, { headers: headers2 }).then(r => r.data).catch(e => ({ error: e.message })),
      axios.get(BACKEND_API3, { headers: headers3 }).then(r => r.data).catch(e => ({ error: e.message }))
    ]);

    

    const extractedData1 = response1?.responseData?.vehicleDetails ? response1.responseData.vehicleDetails.map(item => {
      const extracted = {};
     // console.log("ITEM ",item);
      API1_KEYS.forEach(key => {
        extracted[key] = item[key];
      });
      return extracted;
    }) : [];

    const extractedData2 = response2?.preconditions ? response2.preconditions.map(item => {
  const extracted = {};
  API2_KEYS.forEach(key => {
    extracted[key] = item[key];
  });
  return extracted;
}) : [];

const extractedData3 = response3?.packages ? response3.packages.map(item => {
  const extracted = {};
  API3_KEYS.forEach(key => {
    extracted[key] = item[key];
  });
  return extracted;
}) : [];



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
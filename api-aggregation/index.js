const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();
const app = express();
app.use(express.json());

const INGRESS_API_KEY = process.env.API_KEY;
const BACKEND_APIS = [
  process.env.BACKEND_API1,
  process.env.BACKEND_API2,
  process.env.BACKEND_API3
];
const RE_API_KEY = process.env.RE_API_KEY;
const RE_REQUESTOR = process.env.RE_REQUESTOR;

app.use((req, res, next) => {
  const clientKey = req.headers["x-api-key"];
  if (!clientKey || clientKey !== INGRESS_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

app.post("/aggregate", async (req, res) => {
  try {
    const { payload1, payload2 } = req.body;

    if (!payload1 || !payload2) {
      return res.status(400).json({ error: "Missing payload1 or payload2 in request body" });
    }

    const headers1 = {
      accept: "application/com.c2c.telemetry.location.dto.v1.response.locationresponse.v1+json",
      "api-key": RE_API_KEY,
      "x-requestor": RE_REQUESTOR,
      "Content-Type": "application/com.c2c.telemetry.location.dto.v1.request.locationrequestnew.v1+json"
    };

    const headers2 = {
      accept: "application/com.c2c.telemetry.location.dto.v1.response.vehiclelocationresponse.v1+json",
      "api-key": RE_API_KEY,
      "x-requestor": RE_REQUESTOR,
      "Content-Type": "application/com.c2c.telemetry.location.dto.v1.request.addtelemetrylocationdetailsrequestnew.v1+json"
    };

    const headers3 = {
      accept: "application/com.c2c.telemetry.location.dto.v1.response.vehiclelocationresponse.v1+json",
      "api-key": RE_API_KEY,
      "x-requestor": RE_REQUESTOR
    };

    const [response1, response2, response3] = await Promise.all([
      axios.post(BACKEND_APIS[0], payload1, { headers: headers1, timeout: 5000 }).then(r => r.data).catch(e => ({ error: e.message })),
      axios.post(BACKEND_APIS[1], payload2, { headers: headers2, timeout: 5000 }).then(r => r.data).catch(e => ({ error: e.message })),
      axios.get(BACKEND_APIS[2], { headers: headers3, timeout: 5000 }).then(r => r.data).catch(e => ({ error: e.message }))
    ]);

    return res.json({
      service1: response1,
      service2: response2,
      service3: response3
    });

  } catch (err) {
    console.error("Internal error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Start server
const PORT = process.env.PORT ;
app.listen(PORT, () => {
  console.log(` Ingress listening on port ${PORT}`);
});

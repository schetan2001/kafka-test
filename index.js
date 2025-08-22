const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

const TOKEN_API_URL = "https://accounts.zoho.in/oauth/v2/token?refresh_token=1000.de9f6a55b1bc15f3a7054cae27cbe897.efd51e07c78d8875ec84797452d45a26&grant_type=refresh_token&client_id=1000.JARQGYYRTK7II3HNYA24RJRTA3JYUU&client_secret=84fdafbd326346583d03075e0047368b594f8240da&redirect_uri=https%3A%2F%2Fsdpondemand.manageengine.in%2Fhome%2F&scope=SDPOnDemand.requests.CREATE";
const TOKEN_HEADERS = {
  Cookie: "_zcsr_tmp=dd6b6ad5-2b4d-428a-9761-f782ffa72c05; iamcsr=dd6b6ad5-2b4d-428a-9761-f782ffa72c05; zalb_6e73717622=dea4bb29906843a6fbdf3bd5c0e43d1d"
};
const TICKET_API_URL = "https://sdpondemand.manageengine.in/app/itdesk/api/v3/requests";

let accessToken = null;
let tokenExpiry = null;

async function getAccessToken() {
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }
  const response = await axios.post(TOKEN_API_URL, {}, { headers: TOKEN_HEADERS });
  accessToken = response.data.access_token;
  tokenExpiry = Date.now() + 3600 * 1000; // 1 hour
  return accessToken;
}

function buildTicketPayload(body) {
  // Use body for dynamic payload, fallback to env if not provided
  return {
    request: {
      subject: body.subject || process.env.ME_SUBJECT,
      group: { name: body.group || process.env.ME_GROUP },
      requester: { email_id: body.requester_email || process.env.ME_REQUESTER_EMAIL },
      udf_fields: {
        udf_char319: body.udf_char319 || process.env.ME_UDF_CHAR319,
        udf_char363: body.udf_char363 || process.env.ME_UDF_CHAR363,
        udf_char364: body.udf_char364 || process.env.ME_UDF_CHAR364,
        udf_char365: body.udf_char365 || process.env.ME_UDF_CHAR365,
        udf_char366: body.udf_char366 || process.env.ME_UDF_CHAR366,
        udf_char369: body.udf_char369 || process.env.ME_UDF_CHAR369,
        udf_char370: body.udf_char370 || process.env.ME_UDF_CHAR370,
        udf_char371: body.udf_char371 || process.env.ME_UDF_CHAR371,
        udf_char372: body.udf_char372 || process.env.ME_UDF_CHAR372,
        udf_char373: body.udf_char373 || process.env.ME_UDF_CHAR373,
        udf_char374: body.udf_char374 || process.env.ME_UDF_CHAR374,
        udf_char378: body.udf_char378 || process.env.ME_UDF_CHAR378,
        udf_char379: body.udf_char379 || process.env.ME_UDF_CHAR379,
        udf_char380: body.udf_char380 || process.env.ME_UDF_CHAR380,
        udf_char381: body.udf_char381 || process.env.ME_UDF_CHAR381
      },
      template: { name: body.template || process.env.ME_TEMPLATE },
      description: body.description || process.env.ME_DESCRIPTION
    }
  };
}

app.post("/create-ticket", async (req, res) => {
  try {
    const token = await getAccessToken();
    const headers = {
      Accept: "application/vnd.manageengine.sdp.v3+json",
      Authorization: `Zoho-oauthtoken ${token}`
    };
    const payload = buildTicketPayload(req.body || {});
    const response = await axios.post(TICKET_API_URL, payload, { headers });
    res.json({ payload: response.data });
  } catch (err) {
    res.status(500).json({
      payload: { error: true, message: err.response?.data || err.message }
    });
  }
});

const PORT = process.env.SERVER_PORT || 4000;
app.listen(PORT, () => {
  console.log(`ME Ticket Connector REST API listening on port ${PORT}`);
});
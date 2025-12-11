const express = require("express");
const axios = require("axios");
const multer = require("multer");
const cors = require("cors"); // Import the cors middleware
require("dotenv").config();

const SERVER_PORT = process.env.SERVER_PORT;
const CAMPAIGN_MANAGER_BASE_URL =
  process.env.CAMPAIGN_MANAGER_BASE_URL ||
  "https://cbp-eu-uat.royalenfield.com/ota/campaign-manager";
const API_KEY = process.env.API_KEY;
const ECU_NAME = "composite";

const app = express();
app.use(express.json({ limit: "10gb" }));
app.use(express.urlencoded({ limit: "10gb", extended: true }));
const corsOptions = {
  origin: [
    "https://tap-sit.royalenfield.com",
    "https://wingman-portal-preprod.royalenfield.com",
    "http://localhost:3000",
    "http://localhost:3001",
  ],
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
};

app.use(cors(corsOptions));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use((req, res, next) => {
  const clientKey = req.headers["x-api-key"];
  if (!clientKey || clientKey !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

app.post("/upload-package", upload.single("file"), async (req, res) => {
  const { model, packageName, fileName, targetVersion } = req.body;
  const file = req.file;

  if (!model || !packageName || !fileName || !file) {
    return res
      .status(400)
      .json({
        error:
          "Missing required fields (model, packageName, fileName) or the file.",
      });
  }

  console.log(
    `Starting upload process for model: ${model}, ecu: ${ECU_NAME}, package: ${packageName}, file: ${fileName}`
  );

  // STEP 1: Get the Presigned URL
  let presignedUrl;
  try {
    const getUrl = `${CAMPAIGN_MANAGER_BASE_URL}/ota/campaign-manager/files/${model}/${ECU_NAME}/${packageName}/${fileName}?action=UPLOAD`;

    console.log(`Step 1: Requesting presigned URL from: ${getUrl}`);

    const response = await axios.get(getUrl, {
      headers: {
        Accept: "*/*",
        accept: "*/*",
        "api-key": "WTJGdGNHRnBaMjVBVFdGdVlXZGxjakV5TXc",
        "x-requestor": "admin",
      },
    });

    if (
      response.data.presignedUrlInfo &&
      response.data.presignedUrlInfo.presignedUrl
    ) {
      presignedUrl = response.data.presignedUrlInfo.presignedUrl;
      console.log("Step 1 successful. Received presigned URL.");
    } else {
      console.error(
        "Step 1 failed: Missing presignedUrlInfo in response.",
        response.data
      );
      return res
        .status(500)
        .json({
          error: "Failed to retrieve presigned URL.",
          details: response.data,
        });
    }
  } catch (error) {
    console.error("Error in Step 1 (Get Presigned URL):", error.message);
    if (error.response) {
      console.error("Step 1 Response Data:", error.response.data);
      return res
        .status(500)
        .json({
          error: "External API Error: Failed to get presigned URL.",
          details: error.response.data,
        });
    }
    return res
      .status(500)
      .json({
        error: "External API Error: Failed to get presigned URL.",
        details: error.message,
      });
  }

  // STEP 2: Upload the File to the Presigned URL (PUT)
  try {
    console.log(`Step 2: Uploading file to GCS via presigned URL...`);

    const uploadResponse = await axios.put(presignedUrl, file.buffer, {
      maxBodyLength: Infinity,
      headers: {
        "Content-Type": "application/zip",
      },
    });

    if (uploadResponse.status !== 200 && uploadResponse.status !== 204) {
      console.error(`Step 2 failed with status: ${uploadResponse.status}`);
      return res
        .status(500)
        .json({
          error: "External API Error: File upload failed.",
          statusCode: uploadResponse.status,
          details: uploadResponse.data,
        });
    }
    console.log("Step 2 successful. File uploaded.");
  } catch (error) {
    console.error("Error in Step 2 (File Upload):", error.message);
    if (error.response) {
      console.error("Step 2 Response Data:", error.response.data);
      return res
        .status(500)
        .json({
          error:
            "External API Error: Failed to upload file using presigned URL.",
          details: error.response.data,
        });
    }
    return res
      .status(500)
      .json({
        error: "External API Error: Failed to upload file using presigned URL.",
        details: error.message,
      });
  }

  // STEP 3: Register the Package with Campaign Manager (POST)
  try {
    const registerUrl = `${CAMPAIGN_MANAGER_BASE_URL}/ota/campaign-manager/packages`;
    console.log(
      `Step 3: Registering package with Campaign Manager at: ${registerUrl}`
    );

    const registrationPayload = {
      model: model,
      packageName: packageName,
      fileName: fileName,
      ecuName: ECU_NAME,
      packageType: 2,
      targetVersion: targetVersion,
      partNumber: "585",
      updateType: "fota",
      tagName: "CONDENSEUPLOAD"
    };

    const registrationResponse = await axios.post(
      registerUrl,
      registrationPayload,
      {
        headers: {
          accept: "*/*",
          "api-key": "WTJGdGNHRnBaMjVBVFdGdVlXZGxjakV5TXc",
          "x-requestor": "fota",
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Step 3 successful. Package registered.");

    res.status(200).json({
      message: "Package upload and registration completed successfully.",
      registrationResponse: registrationResponse.data,
      payloadSent: registrationPayload,
    });
  } catch (error) {
    console.error("Error in Step 3 (Package Registration):", error.message);
    if (error.response) {
      console.error("Step 3 Response Data:", error.response.data);
      return res
        .status(500)
        .json({
          error: "External API Error: Failed to register package.",
          details: error.response.data,
        });
    }
    return res
      .status(500)
      .json({
        error: "External API Error: Failed to register package.",
        details: error.message,
      });
  }
});

// Server Start
app.listen(SERVER_PORT, () => {
  console.log(`Server is running on port ${SERVER_PORT}`);
  console.log(`Endpoint: POST /uploadPackage`);
});

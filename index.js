const serverless = require("serverless-http");
const bodyParser = require("body-parser");
const express = require("express");
const querystring = require("querystring");
const AWS = require("aws-sdk");
const request = require("request");
const utils = require("./utils");

const app = express();

const PAYME_TABLE = process.env.PAYME_TABLE;
const PAYME_BASE_URL = process.env.PAYME_URL;
const PAYME_CALLBACK_URL = process.env.PAYME_CALLBACK_URL;
const PAYME_API_KEY = process.env.PAYME_API_KEY;

const dynamoDb = new AWS.DynamoDB.DocumentClient();

app.use(bodyParser.json({ strict: false }));
app.use(bodyParser.text({ type: "application/x-www-form-urlencoded" }));

app.post("/generate-cell", function (req, res) {
  const CALLBACK_URL = PAYME_CALLBACK_URL;

  const headers = req?.headers;
  const origin = headers?.origin;
  const body = utils.parseRequestBody(req);

  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": true,
  });

  if (!body) {
    return res.status(400).json({ msg: "Invalid JSON body" });
  }

  console.log("Origin:", origin);
  console.log("Parsed Body:", JSON.stringify(body, null, 2));

  if (origin && !origin.endsWith("broadcust.co.il")) {
    return res.status(403).json({ msg: "Origin not allowed", origin });
  }

  const {
    buyer_social_id,
    language,
    buyer_name,
    buyer_email,
    buyer_key,
    sale_price,
    currency,
    sale_type,
    installments,
    product_name,
    meta_data_jwt,
    user_id,
  } = body;

  if (!sale_price || !currency || !product_name) {
    return res.status(400).json({
      msg: "Missing required fields: sale_price, currency, product_name",
      received: body,
    });
  }

  const salePayload = {
    seller_payme_id: PAYME_API_KEY,
    sale_price,
    currency,
    product_name,
    sale_type,
    installments,
    sale_payment_method: "credit-card",
    sale_callback_url: CALLBACK_URL,
  };

  const URLS = {
    GENERATE_SALE: `${PAYME_BASE_URL}generate-sale`,
    PAY_SALE: `${PAYME_BASE_URL}pay-sale`,
  };

  console.log("Calling PayMe: generate-sale", salePayload);

  request.post(
    {
      url: URLS.GENERATE_SALE,
      headers: { "Content-Type": "application/json" },
      json: salePayload,
    },
    function (error, response, generateSaleRes) {
      console.log("generate-sale response:", generateSaleRes);

      if (error || response.statusCode !== 200 || !generateSaleRes?.payme_sale_id) {
        console.error("Error in generate-sale:", error || generateSaleRes);
        return res.status(500).json({
          msg: "Failed to generate sale",
          error: error || generateSaleRes,
        });
      }

      const paySalePayload = {
        seller_payme_id: PAYME_API_KEY,
        sale_price,
        currency,
        installments: "1",
        language,
        sale_callback_url: CALLBACK_URL,
        sale_return_url: CALLBACK_URL,
        capture_buyer: 0,
        payme_sale_id: generateSaleRes.payme_sale_id,
        buyer_key,
        buyer_email,
        buyer_name,
        buyer_social_id,
        meta_data_jwt,
      };

      console.log("Calling PayMe: pay-sale", paySalePayload);

      const unixts = Math.floor(Date.now() / 1000);

      const gs_params = {
        TableName: PAYME_TABLE,
        Item: {
          sale_id: generateSaleRes.payme_sale_id,
          user_id: user_id,
          date: unixts,
          gssres: generateSaleRes,
          psres: null,
          status: 1,
        },
      };

      dynamoDb
        .put(gs_params)
        .promise()
        .then(() => console.log("Generate Sale inserted successfully"))
        .catch((err) =>
          console.error("Could not insert transaction data into payme transaction table':", err)
        );

      request.post(
        {
          url: URLS.PAY_SALE,
          headers: { "Content-Type": "application/json" },
          json: paySalePayload,
        },
        function (error, response, paySaleRes) {
          console.log("Pay-sale response:", paySaleRes);

          if (error || response.statusCode !== 200) {
            console.error("Error in pay-sale:", error || paySaleRes);
            return res.status(500).json({
              status: -1,
              msg: "Failed to complete sale payment",
              error: error || paySaleRes,
            });
          }

          return res.status(200).json({
            status: 10,
            msg: "Sale created and payment initiated",
            payme_sale_id: generateSaleRes.payme_sale_id,
            payme_response: paySaleRes,
          });
        }
      );
    }
  );
});

app.post("/pme-listener", async function (req, res) {
  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": true,
  });

  const contentType = req.headers["content-type"];
  let parsedBody = req.body;

  if (contentType === "application/x-www-form-urlencoded" && Buffer.isBuffer(req.body)) {
    parsedBody = querystring.parse(req.body.toString());
  }

  if (!parsedBody) {
    return res.status(400).json({ msg: "Invalid body" });
  }

  console.log("Parsed body:", parsedBody);
  console.log("Payme Sale Id :", parsedBody.payme_sale_id);

  const cleanObject = JSON.parse(JSON.stringify(parsedBody));

  const updateParams = {
    TableName: PAYME_TABLE,
    Key: {
      sale_id: parsedBody.payme_sale_id,
    },
    UpdateExpression: "SET psres = :psres",
    ExpressionAttributeValues: {
      ":psres": cleanObject,
    },
    ReturnValues: "UPDATED_NEW",
  };

  await dynamoDb.update(updateParams).promise();
  console.log("✅ psres updated successfully");
  console.log("PAYME_TABLE: updated successfully");

  res.status(200).json({ msg: "accepted", parsed: parsedBody });
});

app.get("/get-pme-status", async function (req, res) {
  const headers = req?.headers;
  const origin = headers?.origin;
  const sale_id = req.query.sale_id;

  console.log("Req Q:", req.query);

  res.set({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Credentials": true,
  });

  if (origin && !origin.endsWith("broadcust.co.il")) {
    return res.status(403).json({ msg: "Origin not allowed", origin });
  }

  if (!sale_id) {
    console.log("Sale ID doesnot exist:");
    return res.status(400).json({ error: "Missing sale_id parameter" });
  }

  console.log("PAYME_SALE_ID:", sale_id);

  try {
    const result = await dynamoDb
      .get({
        TableName: PAYME_TABLE,
        Key: { sale_id: sale_id },
      })
      .promise();

    const item = result.Item;

    return res.json({
      status: 10,
      sale_id: sale_id,
      psres: item?.psres ?? null,
    });
  } catch (err) {
    console.error("Error fetching from DynamoDB:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports.handler = serverless(app);

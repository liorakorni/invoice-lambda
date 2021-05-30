const serverless = require('serverless-http');
const bodyParser = require('body-parser');
const express = require('express');
const moment = require('moment');
const md5 = require('md5');

const app = express();
const AWS = require('aws-sdk');
const request = require('request');
const utils = require('./utils');

const USERS_TABLE = process.env.USERS_TABLE;
const TYPE_TABLE = process.env.TYPE_TABLE;

const dynamoDb = new AWS.DynamoDB.DocumentClient();
const region = "us-east-1";
const secretName = "ezcount_api_key";
let   secret;
let   decodedBinarySecret;

// Create a Secrets Manager client
// const client = new AWS.SecretsManager({
//     region: region
// });

// client.getSecretValue({SecretId: secretName}, function(err, data) {
//     if (err) {
//         if (err.code === 'DecryptionFailureException')
//         // Secrets Manager can't decrypt the protected secret text using the provided KMS key.
//         // Deal with the exception here, and/or rethrow at your discretion.
//             throw err;
//         else if (err.code === 'InternalServiceErrorException')
//         // An error occurred on the server side.
//         // Deal with the exception here, and/or rethrow at your discretion.
//             throw err;
//         else if (err.code === 'InvalidParameterException')
//         // You provided an invalid value for a parameter.
//         // Deal with the exception here, and/or rethrow at your discretion.
//             throw err;
//         else if (err.code === 'InvalidRequestException')
//         // You provided a parameter value that is not valid for the current state of the resource.
//         // Deal with the exception here, and/or rethrow at your discretion.
//             throw err;
//         else if (err.code === 'ResourceNotFoundException')
//         // We can't find the resource that you asked for.
//         // Deal with the exception here, and/or rethrow at your discretion.
//             throw err;
//     }
//     else {
//         // Decrypts secret using the associated KMS CMK.
//         // Depending on whether the secret is a string or binary, one of these fields will be populated.
//         if ('SecretString' in data) {
//             secret = data.SecretString;
//         } else {
//             let buff = new Buffer(data.SecretBinary, 'base64');
//             decodedBinarySecret = buff.toString('ascii');
//         }
//     }
//
//     // Your code goes here.
// });
//

app.use(bodyParser.json({ strict: false }));

// register to demo.ezcount.co.il to get your own test keys
const ezcount_api_key = '519e9e82846fc9288a8046fbc642af7ac0838d7462f6be9ab1ab95eae22e9345'
const api_email = 'demo@ezcount.co.il';
const developer_email = 'ran@broadcust.com';
const developer_phone = '0528549758';


// before deploying to production, please contact support and ask for your own unique dev_master_ke
const dev_master_key = '4146fe70-01bd-11e7-965d-04011c5ad201';

const url = 'https://demo.ezcount.co.il/api/createDoc';

const data = {
    // CUSTOMER credentials
    api_key: ezcount_api_key,
    api_email: api_email,
    // developer data
    developer_email: developer_email,
    developer_phone: developer_phone,
    // developer identifier and permissions key
    // dev_master_key:dev_master_key,
    // invoice reciept
    type: 320,
    description: "מסלול במערכת ברודקאסט",
    customer_name: "רן כהן",
    customer_email: "ran@broadcust.com",
    customer_address: "זלמן שניאור 5 הרצליה",
    item: [{
        catalog_number: "MKT1",
        details: "item details",
        amount: 1,
        price: 255,
        //this price include the VAT
        vat_type: "INC"
    }],
    payment: [{
        // bank transfer
        payment_type: 4,
        payment: 255,
        comment: "transaction number is 23423423"
    }],
    // THIS IS A MUST ONLY IN INVOICE RECIEPT
    price_total: 255,
    comment: "some general comment for the document",
}

// Create invoices endpoint
app.post('/invoices', function (req, res) {

    const reqbody = req.body;

    if(!reqbody || !reqbody.subscription || !reqbody.subscription.invoice )
    {
        console.log('empty transaction ',reqbody);
        console.log('empty req headers: ', req.headers);
        res.status(406).json({ msg: 'empty transaction ', body: reqbody });
        return;
    }

    if(reqbody && reqbody.subscription && reqbody.subscription.invoice && parseInt(reqbody.subscription.invoice.transaction.amount) == 0)
    {
        console.log('zero transaction amount');
        res.status(200).json({ msg: 'zero transaction amount', body: reqbody });
        return;
    }

    const id = Math.random().toString(36).substring(5);
    const invoiceData= utils.cgDataToEZC(reqbody);

    if (invoiceData && invoiceData.type < 0){
        console.log('declined transaction reqbody', reqbody);
        return;
    }

    request.post(url, { form: invoiceData, json: true }, function(error, response, body) {

        if (!error && response.statusCode == 200) {

            const docData = body;
            const activityDate = reqbody && reqbody.activityDatetime;
            const unixTimeStampActivityDate = activityDate && new Date(activityDate.split(' ').join('T')).getTime();
            const ecNumber  = docData && docData.doc_number;
            const finalEcNumber = unixTimeStampActivityDate + '-' + ecNumber;

            const params = {

                TableName: USERS_TABLE,
                Item: {
                    id: id,
                    user_id: reqbody && reqbody.customer && reqbody.customer.code,
                    invoice_type: invoiceData && invoiceData.type,
                    cg_number: reqbody && reqbody.subscription && reqbody.subscription.invoice  && reqbody.subscription.invoice.invoiceNumber,
                    ec_number: finalEcNumber,
                    trans_id: reqbody && reqbody.subscription && reqbody.subscription.invoice  && reqbody.subscription.invoice.transaction && reqbody.subscription.invoice.transaction.id,
                    doc: docData,
                    transaction: reqbody,
                    activity_time: activityDate,
                    time_stamp_activity_time: unixTimeStampActivityDate,
                    invoice: invoiceData,
                },
            };

            dynamoDb.put(params, (error) => {
                if (error) {
                    console.log(error);
                    res.status(400).json({ error: 'Could not insert invoice in users table' });
                }
            });

            params.TableName = TYPE_TABLE

            res.set({
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Credentials': true,
            });

            dynamoDb.put(params, (error) => {
                if (error) {
                    console.log(error);
                    res.status(400).json({ error: 'Could not insert invoice in type table' });
                }
            });

            res.json({ id, reqbody });


        } else {
            console.error("Failed");
            console.error(error, response);
        }
    });

})

app.get('/', function (req, res) {

    var uid = req.query.uid || null;
    var token = req.query.token || null;
    var role = req.query.role || null;

    res.set({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
    });

    if(uid != null){
        var ssoresult = utils.validateSSOToken(token,uid,role);
        res.send('SSO Validation :' + ssoresult);
    }

    res.send('Hello Worldddd!');

})

// Get User endpoint
 app.get('/invoices/', function (req, res) {

    const now = Date.now().toString();
    console.log("req.query: ", req.query);

    const params = {
        TableName: USERS_TABLE,
        KeyConditionExpression: "user_id = :id and ec_number between :start_date and :end_date",
        ExpressionAttributeValues: {
            ":id": req.query.userId,
            ":start_date": req.query.startDate || '0',
            ":end_date": req.query.endDate || now,
        },
        ProjectionExpression: "user_id, invoice_type, cg_number, ec_number, trans_id, doc, activity_time, time_stamp_activity_time, invoice",
    }

     console.log("req.params 2 ", params);

     dynamoDb.query(params, function(err, data) {
        if (err) {
            console.log("Unable to query. Error:", JSON.stringify(err, null, 2));
            res.status(400).json({ error: 'Could not get user' });
        } else {
            console.log("Query succeeded.");
            if (data.Items) {
                data.Items.forEach(function (item) {
                    console.log(" - ", item.user_id + ": " + item.ec_number);
                });
                res.set({
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true,
                });
                res.status(200).json(data.Items);

            } else {
                res.status(404).json({ error: "User not found" });
            }
        }
    });

})

// Get Type endpoint
app.get('/invoices-type/', function (req, res) {

    const now = Date.now().toString();
    console.log("req.query: ", req.query);

    const params = {
        TableName: TYPE_TABLE,
        KeyConditionExpression: "invoice_type = :req_invoice_type and ec_number between :start_date and :end_date",
        ExpressionAttributeValues: {
            ":req_invoice_type": parseInt(req.query.invoiceType),
            ":start_date": req.query.startDate || '0',
            ":end_date": req.query.endDate || now,
        },
        ProjectionExpression: "user_id, invoice_type, cg_number, ec_number, trans_id, doc, activity_time, time_stamp_activity_time, invoice",
    }

    console.log("req.params 2 ", params);

    dynamoDb.query(params, function(err, data) {
        if (err) {
            console.log("Unable to query. Error:", JSON.stringify(err, null, 2));
            res.status(400).json({ error: 'Could not get type' });
        } else {
            console.log("Query succeeded.");
            if (data.Items) {
                data.Items.forEach(function (item) {
                    console.log(" - ", item.invoice_type + ": " + item.ec_number);
                });
                res.set({
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Credentials': true,
                });
                res.status(200).json(data.Items);

            } else {
                res.status(404).json({ error: "type not found" });
            }
        }
    });

})

module.exports.handler = serverless(app);

const serverless = require('serverless-http');
const bodyParser = require('body-parser');
const express = require('express');
const moment = require('moment');

const app = express()
const AWS = require('aws-sdk');
const request = require('request');
const cgDataToEZC = require('./utils');

const USERS_TABLE = process.env.USERS_TABLE;
const LOG_TABLE = process.env.LOG_TABLE;


let dynamoDb;

dynamoDb = new AWS.DynamoDB.DocumentClient();

app.use(bodyParser.json({ strict: false }));

// register to demo.ezcount.co.il to get your own test keys
var api_key = '519e9e82846fc9288a8046fbc642af7ac0838d7462f6be9ab1ab95eae22e9345'
var api_email = 'demo@ezcount.co.il'
var developer_email = 'ran@broadcust.com'
var developer_phone = '0528549758';


// before deploying to production, please contact support and ask for your own unique dev_master_ke
var dev_master_key = '4146fe70-01bd-11e7-965d-04011c5ad201';

var url = 'https://demo.ezcount.co.il/api/createDoc';

var data = {
    // CUSTOMER credentials
    api_key: api_key,
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
    const invoiceData= cgDataToEZC(reqbody);

    console.log('reqbody ', reqbody);
    console.log('invData', invoiceData);

    request.post(url, { form: invoiceData, json: true }, function(error, response, body) {

        if (!error && response.statusCode == 200) {

            console.log('resdata', body);

            const docData = body;

            const params = {

                TableName: USERS_TABLE,
                Item: {
                    id: id,
                    customerCode: reqbody && reqbody.customer && reqbody.customer.code,
                    transaction: reqbody,
                    activityDataTime: reqbody && reqbody.activityDatetime,
                    invoice: invoiceData,
                    doc: docData,
                },
            };

            dynamoDb.put(params, (error) => {
                if (error) {
                    console.log(error);
                    res.status(400).json({ error: 'Could not create invoice' });
                }
                res.json({ id, reqbody });
            });

        } else {
            console.error("Failed");
            console.error(error, response);
        }
    });
})

app.post('/invoices-pdf', function (req, res) {

    const id = Math.random().toString(36).substring(5);

    request.post(url, { form: data, json: true }, function(error, response, body) {

        if (!error && response.statusCode == 200) {

            console.log(body) // Print the shortened url.
            const params = {
                TableName: LOG_TABLE,
                Item: {
                    id: id,
                    logData: body,
                },
            };

            dynamoDb.put(params, (error) => {
                if (error) {
                    console.log(error);
                    res.status(400).json({ error: 'Could not create invoice' });
                }
                res.json({ id, body });
            });
        } else {
            console.error("Failed");
            console.error(error, response);
        }
    });

})

app.get('/', function (req, res) {
    res.send('Hello World!')
})

// Get User endpoint
app.get('/invoices/:userId', function (req, res) {
    const params = {
        TableName: USERS_TABLE,
        Key: {
            userId: req.params.userId,
        },
    }

    dynamoDb.get(params, (error, result) => {
        if (error) {
            console.log(error);
            res.status(400).json({ error: 'Could not get user' });
        }
        if (result.Item) {
            const {userId, name} = result.Item;
            res.json({ userId, name });
        } else {
            res.status(404).json({ error: "User not found" });
        }
    });
})


module.exports.handler = serverless(app);

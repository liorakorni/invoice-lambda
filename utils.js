const md5 = require('md5');
const moment = require('moment');
// const config = require('./config.dev');


// const bc_sso_key = 'n0b46bab0-44cc-11e5-a9cb-a1ddc9390e29';
// const api_key = '519e9e82846fc9288a8046fbc642af7ac0838d7462f6be9ab1ab95eae22e9345';
// const api_email = 'demo@ezcount.co.il';
// const developer_email = 'ran@broadcust.com';
// const developer_phone = '0528549758';

const EZCOUNT_API_KEY = process.env.EZCOUNT_API_KEY;
const DEVELOPER_EMAIL = process.env.DEVELOPER_EMAIL;
const DEVELOPER_PHONE = process.env.DEVELOPER_PHONE;
const API_EMAIL = process.env.API_EMAIL;
const BC_SSO_KEY = process.env.BC_SSO_KEY;

function cgDataToEZC(jsonData) {

    try {

        const pay_types = {WIRE_TRANS:4,CREDIT_CARD:3};
        const invoice_types = {voided:330,approved:320,declined:-100};

        var invoice = jsonData.subscription.invoice;
        var charges = invoice.charges || invoice.Charges  ;
        var running_total = 0,recurring = false;
        var items = [];

        console.log(charges);

        for (var i in charges) {

            var item = charges[i];

            if(item.description == null){
                item.description = 'billing item';
            }

            if (item.type === 'recurring') {
                items.push({details: jsonData.subscription.plan.name, amount: 1, price: item.eachAmount});
                running_total = running_total + Math.abs(parseFloat(item.eachAmount));
                recurring = true;
                continue;
            }

            if (item.type === 'item') {
                running_total = running_total + Math.abs(parseFloat(item.eachAmount)) * Math.abs(parseInt(item.quantity));
                items.push({details: item.description, amount:item.eachAmount,price:item.quantity});
                continue;
            }

            if(item.type === 'custom') {

                var amount = Math.abs(parseFloat(item.eachAmount)) * Math.abs(parseInt(item.quantity));

                if (amount < 0) {
                    item.eachAmount = amount;
                    item.quantity = 1;
                }

                items.push({details: item.description, amount: item.quantity, price: item.eachAmount});
                running_total = running_total + amount;
                continue;
            }

        }

        var inv_type = extractInvoiceType(invoice,invoice_types);
        var customer_name = (jsonData.customer.company == '' || jsonData.customer.company == null) ? (jsonData.customer.firstName + ' ' + jsonData.customer.lastName):jsonData.customer.company;

        var data = {

            api_key: EZCOUNT_API_KEY,
            api_email: API_EMAIL,
            developer_email: DEVELOPER_EMAIL,
            developer_phone: DEVELOPER_PHONE,
            type: inv_type,
            description: extractInvoiceDescription(inv_type,invoice_types,invoice,recurring),
            customer_name: customer_name,
            item:items,
            price_total: Math.abs(invoice.transaction.amount),
            payment: [{
                payment_type: extractPaymentType(invoice,pay_types),
                payment: Math.abs(invoice.transaction.amount),
            }],

        }

        console.log(data);

        return data;

    } catch (e) {
        console.error(e, "error parsing");
        return jsonData;
    }
}

function extractInvoiceDescription(inv_type,invoice_types,invoice,recurring){

    if (invoice_types.voided === inv_type) {
        return ' חשבונית זיכוי';
    }

    if (recurring) {
        return 'חיוב חודשי למסלול ברודקאסט';
    }

    return 'חיוב במערכת ברודקאסט';
}

function extractInvoiceType(invoice,invoice_types) {
    try {

        if(invoice.transaction.amount < 0){
            return invoice_types['voided']
        }

        return invoice_types[invoice.transaction.response];

    } catch (e) {
        return invoice_types['approved'];
    }
}

function extractPaymentType(invoice,pay_types) {

    try {
        var gwToken = invoice.transaction.gatewayToken;
        return (gwToken.indexOf('WIRE') >= 0) ? pay_types.WIRE_TRANS : pay_types.CREDIT_CARD;
    } catch (e) {
        return null;
    }
}

function validateSSOToken(extToken,uid,role){

    try{

        var timestamp  = moment().format("yyyy-MM-DD");
        var strtosign = "{0}_{1}_{2}_{3}".replace('{0}',BC_SSO_KEY).replace('{1}',uid).replace('{2}',role).replace('{3}',timestamp );
        var intToken = md5(strtosign);

        //console.log('internal token timestamp',timestamp);
        //console.log('internal token to sign',strtosign);
        console.log('internal token:',intToken);
        //console.log('external token:',extToken);

        return intToken == extToken;

    }catch (e) {

        console.log('token match failed',e);
        return false;
    }

}

function parseRequestBody(req) {
    try {
        if (typeof req.body === 'object' && req.body !== null && !Buffer.isBuffer(req.body)) {
            return req.body;
        }

        if (Buffer.isBuffer(req.body)) {
            return JSON.parse(req.body.toString());
        }

        if (typeof req.body === 'string') {
            return JSON.parse(req.body);
        }

        throw new Error('Unsupported request body format');

    } catch (err) {
        console.error('Failed to parse request body:', err.message);
        return null;
    }
}

module.exports = {
    cgDataToEZC :cgDataToEZC,
    validateSSOToken:validateSSOToken,
    parseRequestBody:parseRequestBody
};

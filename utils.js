


const api_key = '519e9e82846fc9288a8046fbc642af7ac0838d7462f6be9ab1ab95eae22e9345'
const api_email = 'demo@ezcount.co.il'
const developer_email = 'ran@broadcust.com'
const developer_phone = '0528549758';



function cgDataToEZC(jsonData) {

    try {
        const pay_types = {WIRE_TRANS:4,CREDIT_CARD:3};
        const invoice_types = {voided:330,approved:320};

        var invoice = jsonData.subscription.invoice;
        var charges = invoice.charges;
        var running_total = 0,recurring = false;
        var items = [];

        for (var i in charges) {

            var item = charges[i];

            if (item.type === 'recurring') {
                items.push({details: jsonData.subscription.plan.name, amount: 1, price: item.eachAmount});
                running_total = running_total + parseFloat(item.eachAmount);
                recurring = true;
                continue;
            }

            if (item.type === 'item') {
                if(item.code !== '100'){
                    item.eachAmount = item.quantity;
                    item.quantity = 1;
                }
                running_total = running_total + parseFloat(item.eachAmount) * parseInt(item.quantity);
                items.push({details: item.description, amount:item.eachAmount,price: item.quantity});
                continue;
            }

            if(item.type === 'custom') {
                var amount = parseFloat(item.eachAmount) * parseInt(item.quantity);
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

        var data = {
            api_key: api_key,
            api_email: api_email,
            developer_email: developer_email,
            developer_phone: developer_phone,
            type: inv_type,
            description: extractInvoiceDescription(recurring,inv_type),
            customer_name: jsonData.customer.company,
            item:items,
            price_total: invoice.transaction.amount,
            payment: [{
                payment_type: extractPaymentType(invoice,pay_types),
                payment: invoice.transaction.amount,
            }],
        }

        return data;

    } catch (e) {
        console.error(e, "error parsing");
        return jsonData;
    }
}

function extractInvoiceDescription(inv_type,invoice_types,invoice,recurring){

    if (invoice_types.voided === inv_type) {
        return 'זיכוי עבור חשבונית - '   + invoice.invoiceNumber;
    }

    if (recurring) {
        return 'חיוב חודשי למסלול ברודקאסט';
    }

    return 'חיוב במערכת ברודקאסט';
}

function extractInvoiceType(invoice,invoice_types) {
    try{
        return invoice_types[invoice.transaction.response];
    }catch (e) {
        return invoice_types['approved'];
    }
}

function extractPaymentType(invoice,pay_types) {
    var gwToken = invoice.transaction.gatewayToken;
    return (gwToken.indexOf('WIRE') >= 0)?pay_types.WIRE_TRANS:pay_types.CREDIT_CARD;
}


module.exports = cgDataToEZC;

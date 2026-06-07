#!/usr/bin/env node
/**
 * Export invoice DynamoDB tables to backup/{stage}/ as JSON.
 * Usage: node scripts/export-invoice-tables.js <stage>
 * Example: node scripts/export-invoice-tables.js dev
 */

const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");

const STAGE = process.argv[2];
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";

const TABLE_SUFFIXES = [
  { key: "users", envPattern: "invoices-users-table-{stage}" },
  { key: "users-data", envPattern: "users-data-table-{stage}" },
  { key: "invoice-type", envPattern: "invoice-type-table-{stage}" },
];

function tableName(pattern, stage) {
  return pattern.replace("{stage}", stage);
}

async function scanAll(docClient, tableName) {
  const items = [];
  let exclusiveStartKey;

  do {
    const result = await docClient
      .scan({
        TableName: tableName,
        ExclusiveStartKey: exclusiveStartKey,
      })
      .promise();
    items.push(...(result.Items || []));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return items;
}

async function main() {
  if (!STAGE) {
    console.error("Usage: node scripts/export-invoice-tables.js <stage>");
    console.error("Example: node scripts/export-invoice-tables.js dev");
    process.exit(1);
  }

  const backupDir = path.join(process.cwd(), "backup", STAGE);
  fs.mkdirSync(backupDir, { recursive: true });

  const docClient = new AWS.DynamoDB.DocumentClient({ region: REGION });
  const summary = {
    stage: STAGE,
    region: REGION,
    exportedAt: new Date().toISOString(),
    tables: {},
  };

  console.log(`Exporting invoice tables for stage="${STAGE}" region="${REGION}"`);
  console.log(`Output directory: ${backupDir}\n`);

  for (const { key, envPattern } of TABLE_SUFFIXES) {
    const name = tableName(envPattern, STAGE);
    process.stdout.write(`Scanning ${name} ... `);

    const items = await scanAll(docClient, name);
    const outFile = path.join(backupDir, `${name}.json`);

    fs.writeFileSync(
      outFile,
      JSON.stringify({ TableName: name, ItemCount: items.length, Items: items }, null, 2)
    );

    summary.tables[name] = { file: outFile, itemCount: items.length };
    console.log(`${items.length} items → ${outFile}`);
  }

  const summaryFile = path.join(backupDir, "_summary.json");
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
  console.log(`\nDone. Summary: ${summaryFile}`);
}

main().catch((err) => {
  console.error("\nExport failed:", err.message);
  if (err.code === "ExpiredTokenException" || err.message.includes("ExpiredToken")) {
    console.error("\nRefresh AWS credentials (e.g. aws sso login, or update ~/.aws/credentials) and retry.");
  }
  process.exit(1);
});

#!/bin/bash
# Phase 0 backup: export invoice DynamoDB tables before repo split.
# Usage: ./scripts/export-invoice-tables.sh <stage>
# Example: ./scripts/export-invoice-tables.sh dev

set -e

STAGE="${1:-}"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -z "${STAGE}" ]]; then
  echo "Usage: $0 <stage>"
  echo "Example: $0 dev"
  exit 1
fi

echo "Checking AWS CLI..."
if ! command -v aws >/dev/null 2>&1; then
  echo "ERROR: aws CLI not found. Install AWS CLI v2 and retry."
  exit 1
fi

echo "Checking AWS credentials (region: ${REGION})..."
if ! aws sts get-caller-identity --region "${REGION}" >/dev/null 2>&1; then
  echo "ERROR: AWS credentials invalid or expired."
  echo "Fix with your usual login (e.g. aws sso login, or refresh ~/.aws/credentials), then retry:"
  echo "  $0 ${STAGE}"
  exit 1
fi

IDENTITY=$(aws sts get-caller-identity --region "${REGION}" --output json)
echo "Authenticated: $(echo "${IDENTITY}" | grep -o '"Arn": "[^"]*"' | head -1)"
echo ""

cd "${REPO_ROOT}"
export AWS_REGION="${REGION}"
export AWS_DEFAULT_REGION="${REGION}"

node "${SCRIPT_DIR}/export-invoice-tables.js" "${STAGE}"

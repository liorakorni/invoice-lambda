#!/bin/bash

set -e

BRANCH=$(git rev-parse --abbrev-ref HEAD)
STAGE=$1

if [[ "$BRANCH" == "dev" && "$STAGE" != "dev" ]]; then
  echo "❌ Deploy to '$STAGE' from 'dev' branch not allowed."
  exit 1
elif [[ "$BRANCH" == "main" && "$STAGE" != "live" ]]; then
  echo "❌ Deploy to '$STAGE' from 'main' branch not allowed."
  exit 1
elif [[ "$BRANCH" != "dev" && "$BRANCH" != "main" ]]; then
  echo "❌ Only 'dev' and 'main' branches may be used for deployment."
  exit 1
fi

echo "✅ Deploying stage '$STAGE' from branch '$BRANCH'..."
npx serverless deploy --stage "$STAGE"

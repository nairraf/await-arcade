#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID to await-arcade or await-arcade-dev}"
REGION="${REGION:-northamerica-northeast1}"
SERVICE="${SERVICE:-await-arcade-api}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-arcade-api@${PROJECT_ID}.iam.gserviceaccount.com}"

gcloud run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --service-account "$SERVICE_ACCOUNT" \
  --allow-unauthenticated \
  --max-instances 2 \
  --min-instances 0 \
  --memory 256Mi \
  --cpu 1 \
  --set-env-vars "AWAIT_ARCADE_PROJECT_ID=${PROJECT_ID},GOOGLE_CLOUD_PROJECT=${PROJECT_ID}"

#!/usr/bin/env bash
set -euo pipefail

if [[ -f .env.deploy ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.deploy
  set +a
fi

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID to await-arcade or await-arcade-dev}"
REGION="${REGION:-northamerica-northeast1}"
SERVICE="${SERVICE:-await-arcade-api}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-arcade-api@${PROJECT_ID}.iam.gserviceaccount.com}"

ENV_VARS="AWAIT_ARCADE_PROJECT_ID=${PROJECT_ID},GOOGLE_CLOUD_PROJECT=${PROJECT_ID}"
if [[ -n "${AWAIT_ARCADE_GITHUB_CLIENT_ID:-}" ]]; then
  ENV_VARS+=",AWAIT_ARCADE_GITHUB_CLIENT_ID=${AWAIT_ARCADE_GITHUB_CLIENT_ID}"
fi
if [[ -n "${AWAIT_ARCADE_REQUIRE_AUTH:-}" ]]; then
  ENV_VARS+=",AWAIT_ARCADE_REQUIRE_AUTH=${AWAIT_ARCADE_REQUIRE_AUTH}"
fi

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
  --set-env-vars "$ENV_VARS"

#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID to await-arcade or await-arcade-dev}"

# One-time project bootstrap. Terraform manages the durable app resources; this
# enables the APIs those resources and Cloud Run need.
gcloud services enable \
  firestore.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com \
  billingbudgets.googleapis.com \
  --project "$PROJECT_ID" --quiet

echo "Enabled Arcade APIs on $PROJECT_ID"

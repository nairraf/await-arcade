# Await Arcade Terraform

Manages the durable GCP base:

- Firestore Native (`(default)`, `northamerica-northeast1`)
- `arcade-api` service account + `roles/datastore.user`
- Secret Manager container for the GitHub OAuth client secret, with read access
  for the API service account
- Monthly billing budget with 50/90/100% alerts

Project API enablement is a one-time bootstrap (`scripts/bootstrap-gcp.sh`), not
Terraform, so a first apply never races Cloud Resource Manager. Cloud Run is
deployed by `scripts/deploy-cloud-run.sh` (source build), so code deploys do not
require a Terraform apply.

## First run

```sh
PROJECT_ID=await-arcade-dev ./scripts/bootstrap-gcp.sh

cd infra/terraform
cp envs/dev.tfvars.example terraform.tfvars
# set project_id; set billing_account to create the budget
terraform init
terraform plan
```

The Budgets API needs a quota project when authenticating with user credentials.
The provider sets it via `user_project_override`/`billing_project`, but Terraform
still needs credentials:

```sh
gcloud auth application-default login
# or, to reuse the gcloud user credential directly:
export GOOGLE_OAUTH_ACCESS_TOKEN=$(gcloud auth print-access-token)
```

Budget amounts must use the billing account currency (`budget_currency`,
default `CAD`). The API stores budget project filters as project numbers, so the
config resolves `data.google_project.current.number` instead of the project id.

## Adopting existing resources

The dev project was set up by hand before Terraform existed. If you start from a
fresh state, import all five resources first; otherwise `apply` fails on the
existing secret and can create a duplicate budget:

```sh
PROJECT_ID=await-arcade-dev

terraform import google_firestore_database.default "projects/$PROJECT_ID/databases/(default)"
terraform import google_service_account.arcade_api "projects/$PROJECT_ID/serviceAccounts/arcade-api@$PROJECT_ID.iam.gserviceaccount.com"
terraform import google_project_iam_member.arcade_api_datastore "$PROJECT_ID roles/datastore.user serviceAccount:arcade-api@$PROJECT_ID.iam.gserviceaccount.com"
terraform import google_secret_manager_secret.github_oauth "projects/$PROJECT_ID/secrets/github-oauth-client-secret"
terraform import 'google_billing_budget.arcade[0]' 'billingAccounts/<billing-account>/budgets/<budget-id>'
```

Find `<budget-id>` with `gcloud billing budgets list --billing-account=<account>`
after setting a quota project, or read `name` from the budget in the console.
Fresh projects can skip the imports; `apply` creates everything.

## Adding the OAuth secret value

Terraform creates only the container. Add the value out of band so it never
enters state:

```sh
printf '%s' "$GITHUB_CLIENT_SECRET" | \
  gcloud secrets versions add github-oauth-client-secret \
    --project "$PROJECT_ID" --data-file=-
```

The API service account already has `roles/secretmanager.secretAccessor`. The
deploy script does not mount the secret yet; that lands with GitHub auth.

## Destroy is not a supported rollback

The Firestore database is pinned with `prevent_destroy` and `deletion_policy =
ABANDON`; the secret has `deletion_protection = true`. Cloud Run is outside
Terraform, so deleting the service account would leave the running service
without a usable identity. Treat this stack as create/update only.

## Prod

Use a separate working directory with its own state. Do not use Terraform
workspaces in the same directory: `terraform.tfvars` is auto-loaded in every
workspace, so a prod plan can silently target the dev project.

```sh
cp -R infra/terraform infra/terraform-prod
cd infra/terraform-prod
cp envs/prod.tfvars.example terraform.tfvars
# set project_id and billing_account
terraform init
terraform apply
```

Never commit `.tfstate` or `*.tfvars`; both are gitignored.

## State

Local state is fine for a single operator. Before adding a second operator or a
CI apply, bootstrap a versioned GCS bucket and switch the backend:

```hcl
terraform {
  backend "gcs" {
    bucket = "await-arcade-tfstate"
    prefix = "arcade"
  }
}
```

## Deploy the API

```sh
PROJECT_ID=await-arcade-dev ./scripts/deploy-cloud-run.sh
```

Firestore rules live in `firestore.rules`. Deploying them requires the project to
be registered with Firebase (`firebase projects:addfirebase`) and the Firebase
CLI or Rules API. The API uses the Admin SDK and bypasses rules, so this is only
needed before a client SDK talks to Firestore directly; the project otherwise
stays a plain GCP project and will not appear in the Firebase console.

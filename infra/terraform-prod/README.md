# Await Arcade — production Terraform

This root manages the **production** durable GCP base for project
`await-arcade`. It is intentionally separate from `infra/terraform/` (dev) so
prod and dev never share local state.

## Managed resources

- Firestore Native `(default)` in `northamerica-northeast1` (permanent location)
- `firestore.rules` ruleset + `cloud.firestore` release
- `arcade-api` service account with `roles/datastore.user`
- `github-oauth-client-secret` Secret Manager container (value added out of band)
- CAD $5 monthly budget with 50/90/100% alerts

Cloud Run itself is deployed by `scripts/deploy-cloud-run.sh`, not Terraform.

## First run

```sh
PROJECT_ID=await-arcade ./scripts/bootstrap-gcp.sh

cd infra/terraform-prod
cp envs/prod.tfvars.example terraform.tfvars   # if starting from a fresh clone
terraform init
terraform plan
terraform apply
```

`terraform.tfvars` and all state files are gitignored. The production project
already exists and was created clean by Terraform; no imports are needed.

## State

Local state is a single-operator convenience, not a backup. Before each apply,
copy `terraform.tfstate` to a timestamped file outside git, or migrate to a
versioned GCS backend:

```hcl
terraform {
  backend "gcs" {
    bucket = "await-arcade-tfstate"
    prefix = "prod"
  }
}
```

Use `prefix = "dev"` for the dev root if it shares the bucket. Never use the
same prefix for both environments.

## Secret value

Terraform creates the secret container only. Add the value out of band:

```sh
printf '%s' "$GITHUB_CLIENT_SECRET" | \
  gcloud secrets versions add github-oauth-client-secret \
    --project await-arcade --data-file=-
```

Device Flow does not use the client secret; this container is reserved for a
future web OAuth flow.

The daily HMAC secret is separate:

```sh
openssl rand -hex 32 | \
  gcloud secrets versions add await-arcade-daily-secret \
    --project await-arcade --data-file=-
```

## TTL policies

Enable TTL on the expiry fields; otherwise old runs and auth records never
age out:

```sh
for collection in runs sessions accessTokens authFlows; do
  gcloud firestore fields ttls update expireAt \
    --collection-group="$collection" --enable-ttl \
    --project await-arcade
done
```

## Firebase Hosting / custom domain

The rules release does **not** require a Firebase project. Firebase Hosting
does, so enable it only when wiring `awaitarcade.com`:

```sh
firebase projects:addfirebase await-arcade
```

Cloud Run domain mappings are Preview and are not available in
`northamerica-northeast1`. Use Firebase Hosting or a global external
Application Load Balancer for the custom API host.

## Keeping dev and prod in sync

`main.tf`, `providers.tf`, `versions.tf`, and `outputs.tf` are intentionally
duplicated between `infra/terraform/` and `infra/terraform-prod/`. Any shared
change must land in both roots. Only `terraform.tfvars` (project, env, budget)
should differ.

## Destroy is not a rollback

Firestore is pinned with `prevent_destroy` and `deletion_policy = "ABANDON"`;
the secret has deletion protection. Treat this stack as create/update only.

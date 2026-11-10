provider "google" {
  project = var.project_id
  region  = var.region

  # Route API quota/billing to the game project instead of the gcloud default
  # quota project. The Budgets API rejects requests without one.
  user_project_override = true
  billing_project       = var.project_id
}

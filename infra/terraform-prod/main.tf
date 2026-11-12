data "google_project" "current" {
  project_id = var.project_id
}

resource "google_firestore_database" "default" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  # The location is permanent. Never let an apply delete the database.
  deletion_policy = "ABANDON"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_firebaserules_ruleset" "firestore" {
  project = var.project_id

  source {
    files {
      name    = "firestore.rules"
      content = file("${path.module}/../../firestore.rules")
    }
  }

  depends_on = [
    google_firestore_database.default,
  ]
}

resource "google_firebaserules_release" "firestore" {
  project      = var.project_id
  name         = "cloud.firestore"
  ruleset_name = google_firebaserules_ruleset.firestore.name

  lifecycle {
    replace_triggered_by = [
      google_firebaserules_ruleset.firestore
    ]
  }
}

resource "google_service_account" "arcade_api" {
  project      = var.project_id
  account_id   = "arcade-api"
  display_name = "Await Arcade API"
}

resource "google_project_iam_member" "arcade_api_datastore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.arcade_api.email}"
}

resource "google_secret_manager_secret" "github_oauth" {
  project   = var.project_id
  secret_id = "github-oauth-client-secret"

  replication {
    auto {}
  }

  deletion_protection = true
}

# The API may read the secret at runtime. The value is added manually with
# `gcloud secrets versions add` and never enters Terraform state.
resource "google_secret_manager_secret_iam_member" "arcade_api_accessor" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.github_oauth.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.arcade_api.email}"
}

resource "google_monitoring_notification_channel" "email_support" {
  project      = var.project_id
  display_name = "Await Arcade support"
  type         = "email"
  labels = {
    email_address = "support@awaitarcade.com"
  }
}

resource "google_monitoring_notification_channel" "email_ian" {
  count        = var.personal_alert_email == "" ? 0 : 1
  project      = var.project_id
  display_name = "Await Arcade Ian"
  type         = "email"
  labels = {
    email_address = var.personal_alert_email
  }
}

resource "google_billing_budget" "arcade" {
  count = var.billing_account == "" ? 0 : 1

  billing_account = var.billing_account
  display_name    = "Await Arcade ${var.env} ${var.budget_currency} ${var.budget_amount}"

  amount {
    specified_amount {
      currency_code = var.budget_currency
      units         = tostring(var.budget_amount)
    }
  }

  budget_filter {
    # The Budgets API normalizes projects to project numbers.
    projects = ["projects/${data.google_project.current.number}"]
  }

  threshold_rules {
    threshold_percent = 0.5
  }

  threshold_rules {
    threshold_percent = 0.9
  }

  threshold_rules {
    threshold_percent = 1.0
  }

  all_updates_rule {
    monitoring_notification_channels = concat(
      [google_monitoring_notification_channel.email_support.id],
      var.personal_alert_email == "" ? [] : [google_monitoring_notification_channel.email_ian[0].id],
    )
  }
}

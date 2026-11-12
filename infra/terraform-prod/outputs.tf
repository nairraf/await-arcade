output "project_id" {
  value = var.project_id
}

output "firestore_database" {
  value = google_firestore_database.default.name
}

output "api_service_account" {
  value = google_service_account.arcade_api.email
}

output "github_oauth_secret" {
  value = google_secret_manager_secret.github_oauth.secret_id
}

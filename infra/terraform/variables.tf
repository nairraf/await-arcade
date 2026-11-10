variable "project_id" {
  type        = string
  description = "GCP project id, e.g. await-arcade-dev"
}

variable "region" {
  type        = string
  default     = "northamerica-northeast1"
  description = "Firestore location and provider default region. The Firestore location is permanent and must stay in sync with the Cloud Run deploy script."
}

variable "env" {
  type        = string
  default     = "dev"
  description = "Environment label used in the budget display name. Each environment uses its own project."
}

variable "billing_account" {
  type        = string
  default     = ""
  description = "Billing account id for the budget. Leave empty to skip the budget."
}

variable "budget_currency" {
  type        = string
  default     = "CAD"
  description = "Currency of the billing account. Budgets must use the account currency."
}

variable "budget_amount" {
  type        = number
  default     = 5
  description = "Monthly budget in whole units of budget_currency. Alerts fire at 50%, 90%, and 100%."
}

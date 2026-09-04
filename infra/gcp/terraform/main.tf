locals {
  prefix = "${var.app_name}-${var.environment}"
  services = toset([
    "artifactregistry.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "logging.googleapis.com",
    "redis.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
    "sts.googleapis.com",
    "storage.googleapis.com"
  ])
  runtime_secret_ids = toset([
    "session-hmac-key",
    "pii-hash-key",
    "mfa-encryption-key",
    "token-encryption-key",
    "redis-url",
    "redis-ca-cert-base64",
    "sms-webhook-bearer-token",
    "email-webhook-bearer-token"
  ])
  bootstrap_secret_ids = toset([
    "admin-bootstrap-password",
    "admin-bootstrap-totp-secret"
  ])
  all_secret_ids = setunion(local.runtime_secret_ids, local.bootstrap_secret_ids)
}

resource "google_project_service" "required" {
  for_each           = local.services
  service            = each.value
  disable_on_destroy = false
}

resource "google_compute_network" "main" {
  name                    = "${local.prefix}-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.required]
}

resource "google_compute_subnetwork" "main" {
  name                     = "${local.prefix}-${var.region}"
  region                   = var.region
  network                  = google_compute_network.main.id
  ip_cidr_range            = "10.20.0.0/20"
  private_ip_google_access = true
}

resource "google_compute_global_address" "private_services" {
  name          = "${local.prefix}-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
}

resource "google_service_account" "api" {
  account_id   = "${var.app_name}-${var.environment}-api"
  display_name = "Thiqah ${var.environment} API runtime"
}

resource "google_service_account" "migrator" {
  account_id   = "${var.app_name}-${var.environment}-migrator"
  display_name = "Thiqah ${var.environment} database migrator"
}

resource "google_service_account" "deploy" {
  account_id   = "${var.app_name}-${var.environment}-deploy"
  display_name = "Thiqah ${var.environment} GitHub deployer"
}

resource "google_sql_database_instance" "postgres" {
  name                = "${local.prefix}-postgres"
  region              = var.region
  database_version    = var.db_version
  deletion_protection = true

  settings {
    edition           = var.db_edition
    tier              = var.db_tier
    availability_type = var.db_availability_type
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "02:00"
      transaction_log_retention_days = 7
    }

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.main.id
      enable_private_path_for_google_cloud_services = true
    }

    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }
  }

  depends_on = [google_service_networking_connection.private_vpc]
}

resource "google_sql_database" "app" {
  name     = "thiqah"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "api_iam" {
  name     = trimsuffix(google_service_account.api.email, ".gserviceaccount.com")
  instance = google_sql_database_instance.postgres.name
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}

resource "google_sql_user" "migrator_iam" {
  name           = trimsuffix(google_service_account.migrator.email, ".gserviceaccount.com")
  instance       = google_sql_database_instance.postgres.name
  type           = "CLOUD_IAM_SERVICE_ACCOUNT"
  database_roles = ["cloudsqlsuperuser"]
}

resource "google_redis_instance" "cache" {
  name                    = "${local.prefix}-redis"
  tier                    = var.redis_tier
  memory_size_gb          = var.redis_memory_gb
  region                  = var.region
  redis_version           = "REDIS_7_2"
  authorized_network      = google_compute_network.main.id
  connect_mode            = "PRIVATE_SERVICE_ACCESS"
  auth_enabled            = true
  transit_encryption_mode = "SERVER_AUTHENTICATION"
  depends_on              = [google_service_networking_connection.private_vpc]
}

resource "google_storage_bucket" "media" {
  name                        = "${var.project_id}-${local.prefix}-private-media"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning { enabled = true }

  lifecycle_rule {
    condition { num_newer_versions = 3 }
    action { type = "Delete" }
  }
}

resource "google_artifact_registry_repository" "api" {
  location      = var.region
  repository_id = "${local.prefix}-api"
  format        = "DOCKER"
}

resource "google_secret_manager_regional_secret" "runtime" {
  for_each  = local.all_secret_ids
  secret_id = "${local.prefix}-${each.key}"
  location  = var.region

  deletion_protection = true
  version_destroy_ttl = "86400s"
}

resource "google_storage_bucket_iam_member" "api_media" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "api_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "api_sql_login" {
  project = var.project_id
  role    = "roles/cloudsql.instanceUser"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "migrator_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.migrator.email}"
}

resource "google_project_iam_member" "migrator_sql_login" {
  project = var.project_id
  role    = "roles/cloudsql.instanceUser"
  member  = "serviceAccount:${google_service_account.migrator.email}"
}

resource "google_secret_manager_regional_secret_iam_member" "api_secrets" {
  for_each  = local.runtime_secret_ids
  project   = var.project_id
  location  = var.region
  secret_id = google_secret_manager_regional_secret.runtime[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_secret_manager_regional_secret_iam_member" "bootstrap_secrets" {
  for_each = toset([
    "mfa-encryption-key",
    "admin-bootstrap-password",
    "admin-bootstrap-totp-secret"
  ])
  project   = var.project_id
  location  = var.region
  secret_id = google_secret_manager_regional_secret.runtime[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.migrator.email}"
}

# V4 Cloud Storage signed URLs generated with Application Default Credentials
# require iam.serviceAccounts.signBlob. The runtime service account is allowed
# to sign as itself only; no long-lived private key is created or stored.
resource "google_service_account_iam_member" "api_self_sign_blob" {
  service_account_id = google_service_account.api.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.api.email}"
}

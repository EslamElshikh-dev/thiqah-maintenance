resource "google_logging_project_bucket_config" "app" {
  project        = var.project_id
  location       = var.region
  bucket_id      = "${local.prefix}-app"
  retention_days = var.log_retention_days
  description    = "Regional Thiqah application logs"
}

resource "google_logging_project_sink" "app" {
  name        = "${local.prefix}-regional-app-logs"
  destination = "logging.googleapis.com/projects/${var.project_id}/locations/${var.region}/buckets/${google_logging_project_bucket_config.app.bucket_id}"
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    AND resource.labels.service_name="${local.prefix}-api"
  EOT
}

resource "google_logging_project_exclusion" "app_from_default" {
  name        = "${local.prefix}-exclude-app-from-default"
  description = "Keep Thiqah application logs out of the global _Default bucket after routing them regionally"
  filter      = <<-EOT
    resource.type="cloud_run_revision"
    AND resource.labels.service_name="${local.prefix}-api"
  EOT
}

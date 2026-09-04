variable "project_id" { type = string }
variable "region" {
  type    = string
  default = "me-central2"
  validation {
    condition     = var.region == "me-central2"
    error_message = "Thiqah staging data plane must remain in me-central2."
  }
}
variable "app_name" { type = string default = "thiqah" }
variable "environment" { type = string default = "staging" }
variable "github_repository" { type = string default = "EslamElshikh-dev/thiqah-maintenance" }
variable "github_repository_id" {
  type = string
  validation {
    condition     = can(regex("^[0-9]+$", var.github_repository_id))
    error_message = "github_repository_id must be the immutable numeric GitHub repository ID."
  }
}
variable "github_repository_owner_id" {
  type    = string
  default = "264218940"
  validation {
    condition     = can(regex("^[0-9]+$", var.github_repository_owner_id))
    error_message = "github_repository_owner_id must be the immutable numeric GitHub owner ID."
  }
}
variable "github_deploy_ref" { type = string default = "refs/heads/main" }

variable "db_version" { type = string default = "POSTGRES_17" }
variable "db_edition" { type = string default = "ENTERPRISE" }
variable "db_tier" { type = string default = "db-custom-2-7680" }
variable "db_availability_type" { type = string default = "ZONAL" }

variable "redis_memory_gb" { type = number default = 1 }
variable "redis_tier" { type = string default = "BASIC" }

variable "log_retention_days" { type = number default = 30 }

resource "random_string" "app_suffix" {
  length  = 6
  upper   = false
  lower   = true
  numeric = true
  special = false
}

locals {
  bootstrap_image = "mcr.microsoft.com/k8se/quickstart:latest"

  app_base_raw = trim(substr(local.base_name, 0, 15), "-")
  app_base     = length(local.app_base_raw) > 0 ? local.app_base_raw : "caira"
  app_prefix   = "${local.app_base}-${random_string.app_suffix.result}"

  acr_hash = substr(sha1(local.base_name), 0, 12)
  acr_name = "caira${local.acr_hash}${random_string.app_suffix.result}"

  resolved_agent_image    = trimspace(var.agent_image) != "" ? trimspace(var.agent_image) : local.bootstrap_image
  resolved_api_image      = trimspace(var.api_image) != "" ? trimspace(var.api_image) : local.bootstrap_image
  resolved_frontend_image = trimspace(var.frontend_image) != "" ? trimspace(var.frontend_image) : local.bootstrap_image
}

module "container_registry" {
  source = "../../../../strategy-builder/infra/modules/container_registry"

  name                = local.acr_name
  location            = var.location
  resource_group_name = local.resource_group_name
  tags                = var.tags
}

module "container_apps_environment" {
  source = "../../../../strategy-builder/infra/modules/container_apps_environment"

  name                       = "${local.app_prefix}-env"
  location                   = var.location
  resource_group_name        = local.resource_group_name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.this.id
  infrastructure_subnet_id   = local.effective_container_apps_infrastructure_subnet_id
  tags                       = var.tags
}

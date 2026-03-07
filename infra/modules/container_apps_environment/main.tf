locals {
  use_private_network = var.infrastructure_subnet_id != null
}

resource "azurerm_container_app_environment" "this" {
  name                           = var.name
  location                       = var.location
  resource_group_name            = var.resource_group_name
  log_analytics_workspace_id     = var.log_analytics_workspace_id
  infrastructure_subnet_id       = var.infrastructure_subnet_id
  internal_load_balancer_enabled = local.use_private_network ? true : null
  tags                           = var.tags
}

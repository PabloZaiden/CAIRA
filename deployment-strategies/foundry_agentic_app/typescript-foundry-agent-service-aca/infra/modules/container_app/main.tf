locals {
  resolved_container_name = coalesce(var.container_name, var.name)
  allowed_cidr_map        = { for index, cidr in var.allowed_cidrs : tostring(index) => cidr }
}

resource "azurerm_container_app" "this" {
  name                         = var.name
  resource_group_name          = var.resource_group_name
  container_app_environment_id = var.container_app_environment_id
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type = "SystemAssigned"
  }

  dynamic "registry" {
    for_each = var.enable_registry_auth ? [1] : []
    content {
      server   = var.registry_server
      identity = "system"
    }
  }

  template {
    min_replicas = var.min_replicas
    max_replicas = var.max_replicas

    container {
      name   = local.resolved_container_name
      image  = var.image
      cpu    = var.cpu
      memory = var.memory

      dynamic "env" {
        for_each = var.environment_variables
        content {
          name  = env.key
          value = env.value
        }
      }
    }
  }

  dynamic "ingress" {
    for_each = var.ingress_enabled ? [1] : []
    content {
      external_enabled           = var.external_enabled
      target_port                = var.target_port
      transport                  = var.transport
      allow_insecure_connections = var.allow_insecure_connections

      dynamic "ip_security_restriction" {
        for_each = var.external_enabled ? local.allowed_cidr_map : {}
        content {
          name             = "allow-configured-cidr-${ip_security_restriction.key}"
          action           = "Allow"
          ip_address_range = ip_security_restriction.value
        }
      }

      traffic_weight {
        latest_revision = true
        percentage      = 100
      }
    }
  }
}

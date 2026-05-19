resource "random_string" "suffix" {
  length  = 6
  upper   = false
  lower   = true
  numeric = true
  special = false
}

locals {
  base_name_raw = trim(replace(lower(var.project_name), "/[^a-z0-9-]/", "-"), "-")
  base_name     = length(local.base_name_raw) > 0 ? local.base_name_raw : "caira"
  name_prefix   = "${substr(local.base_name, 0, min(length(local.base_name), 15))}-${random_string.suffix.result}"

  api_env = merge(var.api_env, {
    PORT                  = "4000"
    AZURE_OPENAI_ENDPOINT = var.azure_openai_endpoint
    AGENT_MODEL           = var.agent_model
  })

  frontend_env = merge(var.frontend_env, {
    PORT         = "8080"
    API_BASE_URL = "https://${azurerm_container_app.api.ingress[0].fqdn}"
  })
}

resource "azurerm_resource_group" "this" {
  name     = "rg-${local.name_prefix}"
  location = var.location
  tags     = var.tags
}

resource "azurerm_log_analytics_workspace" "this" {
  name                = "law-${local.name_prefix}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = var.tags
}

resource "azurerm_container_registry" "this" {
  name                = replace("acr${local.name_prefix}", "-", "")
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  sku                 = "Basic"
  admin_enabled       = false
  tags                = var.tags
}

resource "azurerm_container_app_environment" "this" {
  name                       = "cae-${local.name_prefix}"
  location                   = azurerm_resource_group.this.location
  resource_group_name        = azurerm_resource_group.this.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.this.id
  tags                       = var.tags
}

resource "azurerm_container_app" "api" {
  name                         = "ca-${local.name_prefix}-api"
  container_app_environment_id = azurerm_container_app_environment.this.id
  resource_group_name          = azurerm_resource_group.this.name
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type = "SystemAssigned"
  }

  ingress {
    external_enabled = false
    target_port      = 4000
    transport        = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  template {
    min_replicas = 1
    max_replicas = 3

    container {
      name   = "api"
      image  = var.api_image
      cpu    = 0.5
      memory = "1Gi"

      dynamic "env" {
        for_each = local.api_env
        content {
          name  = env.key
          value = env.value
        }
      }
    }
  }
}

resource "azurerm_container_app" "frontend" {
  name                         = "ca-${local.name_prefix}-frontend"
  container_app_environment_id = azurerm_container_app_environment.this.id
  resource_group_name          = azurerm_resource_group.this.name
  revision_mode                = "Single"
  tags                         = var.tags

  identity {
    type = "SystemAssigned"
  }

  ingress {
    external_enabled = true
    target_port      = 8080
    transport        = "auto"
    dynamic "ip_security_restriction" {
      for_each = var.frontend_allowed_cidrs
      content {
        name             = "allow-${replace(replace(ip_security_restriction.value, ".", "-"), "/", "-")}"
        action           = "Allow"
        ip_address_range = ip_security_restriction.value
        description      = "Allowed frontend client CIDR"
      }
    }

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  template {
    min_replicas = 1
    max_replicas = 3

    container {
      name   = "frontend"
      image  = var.frontend_image
      cpu    = 0.25
      memory = "0.5Gi"

      dynamic "env" {
        for_each = local.frontend_env
        content {
          name  = env.key
          value = env.value
        }
      }
    }
  }
}

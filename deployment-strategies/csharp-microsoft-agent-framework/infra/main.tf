resource "random_string" "suffix" {
  length  = 6
  upper   = false
  lower   = true
  numeric = true
  special = false
}

locals {
  project_slug_raw = trim(replace(lower(var.project_name), "/[^a-z0-9-]/", "-"), "-")
  project_slug     = length(local.project_slug_raw) > 0 ? local.project_slug_raw : "caira"

  app_base_raw = trim(substr(local.project_slug, 0, 15), "-")
  app_base     = length(local.app_base_raw) > 0 ? local.app_base_raw : "caira"
  app_prefix   = "${local.app_base}-${random_string.suffix.result}"

  acr_hash        = substr(sha1(local.project_slug), 0, 12)
  acr_base        = "caira${local.acr_hash}"
  ai_resource_id  = trimspace(var.ai_resource_id)
  assign_ai_roles = var.deploy_apps && local.ai_resource_id != ""

  common_tags = merge(
    {
      managed-by = "terraform"
      workload   = "caira-sample"
      project    = var.project_name
    },
    var.tags,
  )
}

resource "azurerm_resource_group" "this" {
  name     = "${local.app_prefix}-rg"
  location = var.location
  tags     = local.common_tags
}

resource "azurerm_log_analytics_workspace" "this" {
  name                = "${local.app_prefix}-law"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.common_tags
}

resource "azurerm_container_app_environment" "this" {
  name                       = "${local.app_prefix}-env"
  location                   = azurerm_resource_group.this.location
  resource_group_name        = azurerm_resource_group.this.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.this.id
  tags                       = local.common_tags
}

module "registry" {
  source = "./modules/acr"

  name                = "${local.acr_base}${random_string.suffix.result}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  tags                = local.common_tags
}

resource "azurerm_container_app" "agent" {
  count = var.deploy_apps ? 1 : 0

  name                         = "${local.app_prefix}-agent"
  resource_group_name          = azurerm_resource_group.this.name
  container_app_environment_id = azurerm_container_app_environment.this.id
  revision_mode                = "Single"
  tags                         = local.common_tags

  identity {
    type = "SystemAssigned"
  }

  dynamic "registry" {
    for_each = var.enable_registry_auth ? [1] : []
    content {
      server   = module.registry.login_server
      identity = "system"
    }
  }

  template {
    min_replicas = 1
    max_replicas = 1

    container {
      name   = "agent"
      image  = var.agent_image
      cpu    = 0.5
      memory = "1Gi"

      dynamic "env" {
        for_each = merge(var.agent_env, { PORT = "3000" })
        content {
          name  = env.key
          value = env.value
        }
      }
    }
  }

  ingress {
    external_enabled = false
    target_port      = 3000
    transport        = "http"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
}

resource "azurerm_container_app" "api" {
  count = var.deploy_apps ? 1 : 0

  name                         = "${local.app_prefix}-api"
  resource_group_name          = azurerm_resource_group.this.name
  container_app_environment_id = azurerm_container_app_environment.this.id
  revision_mode                = "Single"
  tags                         = local.common_tags

  depends_on = [azurerm_container_app.agent]

  identity {
    type = "SystemAssigned"
  }

  dynamic "registry" {
    for_each = var.enable_registry_auth ? [1] : []
    content {
      server   = module.registry.login_server
      identity = "system"
    }
  }

  template {
    min_replicas = 1
    max_replicas = 1

    container {
      name   = "api"
      image  = var.api_image
      cpu    = 0.5
      memory = "1Gi"

      dynamic "env" {
        for_each = merge(
          var.api_env,
          {
            PORT              = "4000"
            AGENT_SERVICE_URL = "https://${azurerm_container_app.agent[0].ingress[0].fqdn}"
          },
        )
        content {
          name  = env.key
          value = env.value
        }
      }
    }
  }

  ingress {
    external_enabled = false
    target_port      = 4000
    transport        = "http"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
}

resource "azurerm_container_app" "frontend" {
  count = var.deploy_apps ? 1 : 0

  name                         = "${local.app_prefix}-frontend"
  resource_group_name          = azurerm_resource_group.this.name
  container_app_environment_id = azurerm_container_app_environment.this.id
  revision_mode                = "Single"
  tags                         = local.common_tags

  depends_on = [azurerm_container_app.api]

  identity {
    type = "SystemAssigned"
  }

  dynamic "registry" {
    for_each = var.enable_registry_auth ? [1] : []
    content {
      server   = module.registry.login_server
      identity = "system"
    }
  }

  template {
    min_replicas = 1
    max_replicas = 1

    container {
      name   = "frontend"
      image  = var.frontend_image
      cpu    = 0.5
      memory = "1Gi"

      dynamic "env" {
        for_each = merge(
          var.frontend_env,
          {
            PORT         = "8080"
            API_BASE_URL = "https://${azurerm_container_app.api[0].ingress[0].fqdn}"
          },
        )
        content {
          name  = env.key
          value = env.value
        }
      }
    }
  }

  ingress {
    external_enabled           = true
    target_port                = 8080
    transport                  = "auto"
    allow_insecure_connections = false

    ip_security_restriction {
      name             = "allow-current-ip"
      action           = "Allow"
      ip_address_range = var.allowed_cidr
    }

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
}

resource "azurerm_role_assignment" "agent_acr_pull" {
  count = var.deploy_apps ? 1 : 0

  scope                            = module.registry.id
  role_definition_name             = "AcrPull"
  principal_id                     = azurerm_container_app.agent[0].identity[0].principal_id
  skip_service_principal_aad_check = true
}

resource "azurerm_role_assignment" "api_acr_pull" {
  count = var.deploy_apps ? 1 : 0

  scope                            = module.registry.id
  role_definition_name             = "AcrPull"
  principal_id                     = azurerm_container_app.api[0].identity[0].principal_id
  skip_service_principal_aad_check = true
}

resource "azurerm_role_assignment" "frontend_acr_pull" {
  count = var.deploy_apps ? 1 : 0

  scope                            = module.registry.id
  role_definition_name             = "AcrPull"
  principal_id                     = azurerm_container_app.frontend[0].identity[0].principal_id
  skip_service_principal_aad_check = true
}

resource "azurerm_role_assignment" "agent_openai_user" {
  count = local.assign_ai_roles ? 1 : 0

  scope                            = local.ai_resource_id
  role_definition_name             = "Cognitive Services OpenAI User"
  principal_id                     = azurerm_container_app.agent[0].identity[0].principal_id
  skip_service_principal_aad_check = true
}

resource "azurerm_role_assignment" "agent_ai_user" {
  count = local.assign_ai_roles ? 1 : 0

  scope                            = local.ai_resource_id
  role_definition_name             = "Azure AI User"
  principal_id                     = azurerm_container_app.agent[0].identity[0].principal_id
  skip_service_principal_aad_check = true
}

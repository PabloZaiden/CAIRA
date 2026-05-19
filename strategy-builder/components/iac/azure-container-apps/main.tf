# Foundry Agentic App reference architecture template.
#
# Keep the generated infrastructure close to the default CAIRA sample: one Foundry
# account, one project, public networking, and app-related infrastructure composed in
# small layers across application_platform.tf, agent_service.tf, api_service.tf, and
# frontend_service.tf.

module "common_models" {
  source = "../../../infra/modules/common_models"
}

module "naming" {
  source        = "Azure/naming/azurerm"
  version       = "0.4.3"
  suffix        = [local.base_name]
  unique-length = 5
}

resource "azurerm_resource_group" "this" {
  location = var.location
  name     = module.naming.resource_group.name_unique
  tags     = var.tags
}

locals {
  base_name_raw = trim(replace(lower(var.project_name), "/[^a-z0-9-]/", "-"), "-")
  base_name     = length(local.base_name_raw) > 0 ? local.base_name_raw : "caira"

  resource_group_id   = azurerm_resource_group.this.id
  resource_group_name = azurerm_resource_group.this.name

  avm_base_name_candidate = trim(substr(local.base_name, 0, 9), "-")
  avm_base_name           = length(local.avm_base_name_candidate) >= 3 ? local.avm_base_name_candidate : "caira"

  foundry_models = [
    module.common_models.gpt_5_2_chat,
    module.common_models.gpt_5_nano,
    module.common_models.text_embedding_3_large,
    module.common_models.gpt_4o_mini
  ]

  foundry_model_deployments = {
    for model in local.foundry_models : model.name => {
      name = model.name
      model = {
        format  = model.format
        name    = model.name
        version = model.version
      }
      scale = {
        type     = "GlobalStandard"
        capacity = 50
      }
    }
  }
}

module "foundry" {
  source  = "Azure/avm-ptn-aiml-ai-foundry/azurerm"
  version = "0.10.1"

  base_name                  = local.avm_base_name
  location                   = var.location
  resource_group_resource_id = local.resource_group_id
  enable_telemetry           = var.enable_telemetry
  tags                       = var.tags

  create_byor                         = false
  create_private_endpoints            = local.testing_private_enabled
  private_endpoint_subnet_resource_id = local.effective_foundry_subnet_id

  ai_foundry = {
    name                          = module.naming.cognitive_account.name_unique
    disable_local_auth            = true
    allow_project_management      = true
    create_ai_agent_service       = local.testing_capability_host_enabled
    private_dns_zone_resource_ids = local.effective_foundry_private_dns_zone_ids
    network_injections = local.testing_capability_host_enabled ? [
      {
        scenario                   = "agent"
        subnetArmId                = local.effective_agents_subnet_id
        useMicrosoftManagedNetwork = false
      }
    ] : null
  }

  ai_model_deployments = local.foundry_model_deployments

  ai_projects = {
    default = {
      name                       = "default-project"
      display_name               = "Default Project"
      description                = "Default Project description"
      create_project_connections = local.testing_capability_host_enabled
      cosmos_db_connection = {
        existing_resource_id = local.effective_capability_host_cosmosdb_id
      }
      ai_search_connection = {
        existing_resource_id = local.effective_capability_host_search_id
      }
      storage_account_connection = {
        existing_resource_id = local.effective_capability_host_storage_id
      }
    }
  }

  depends_on = [time_sleep.wait_before_purge_foundry]
}

resource "azapi_resource" "appinsights_connection" {
  type                      = "Microsoft.CognitiveServices/accounts/connections@2025-06-01"
  name                      = module.application_insights.name
  parent_id                 = module.foundry.ai_foundry_id
  schema_validation_enabled = false

  body = {
    name = module.application_insights.name
    properties = {
      category      = "AppInsights"
      target        = module.application_insights.resource_id
      authType      = "ApiKey"
      isSharedToAll = true
      credentials = {
        key = module.application_insights.connection_string
      }
      metadata = {
        ApiType    = "Azure"
        ResourceId = module.application_insights.resource_id
      }
    }
  }

  depends_on = [module.foundry]
}

resource "azapi_resource_action" "purge_ai_foundry" {
  method      = "DELETE"
  resource_id = "/subscriptions/${data.azurerm_client_config.current.subscription_id}/providers/Microsoft.CognitiveServices/locations/${var.location}/resourceGroups/${local.resource_group_name}/deletedAccounts/${module.naming.cognitive_account.name_unique}"
  type        = "Microsoft.Resources/resourceGroups/deletedAccounts@2025-09-01"
  when        = "destroy"
}

resource "time_sleep" "wait_before_purge_foundry" {
  destroy_duration = "60s"

  depends_on = [azapi_resource_action.purge_ai_foundry]
}

# Foundry Agentic App reference architecture.
#
# Keep the default sample simple: one Foundry account, one project, public
# networking, and app-related infrastructure composed in small layers across
# application_platform.tf, agent_service.tf, api_service.tf, and frontend_service.tf.
#
# If you need private networking, change only the module blocks called out in those
# files instead of bloating the default sample with permanent extra inputs.
#
# If you need the more advanced Foundry agent-service pattern with capability-host
# resources, keep that logic out of the default sample. Add capability-host resources
# only in the derived implementation, then set `enable_agents_capability_host = true`
# on the `foundry` module and pass `agent_capability_host_connections` into the
# project module. See README.md and the CAIRA skill for the exact guidance.

module "common_models" {
  source = "../modules/common_models"
}

module "naming" {
  source        = "Azure/naming/azurerm"
  version       = "0.4.3"
  suffix        = [local.base_name]
  unique-length = 5
}

resource "random_string" "foundry_suffix" {
  length  = 6
  upper   = false
  lower   = true
  numeric = true
  special = false
}

resource "azurerm_resource_group" "this" {
  count    = var.resource_group_resource_id == null ? 1 : 0
  location = var.location
  name     = module.naming.resource_group.name_unique
  tags     = var.tags
}

locals {
  base_name_raw = trim(replace(lower(var.project_name), "/[^a-z0-9-]/", "-"), "-")
  base_name     = length(local.base_name_raw) > 0 ? local.base_name_raw : "caira"

  resource_group_resource_id = var.resource_group_resource_id != null ? var.resource_group_resource_id : azurerm_resource_group.this[0].id
  resource_group_name        = var.resource_group_resource_id != null ? provider::azapi::parse_resource_id("Microsoft.Resources/resourceGroups", var.resource_group_resource_id).resource_group_name : azurerm_resource_group.this[0].name

  ai_foundry_hash = substr(sha1(local.base_name), 0, 10)
  ai_foundry_name = "cairaai${local.ai_foundry_hash}${random_string.foundry_suffix.result}"
}

module "foundry" {
  source = "../modules/ai_foundry"

  resource_group_id = local.resource_group_resource_id
  location          = var.location
  sku               = var.sku
  name              = local.ai_foundry_name

  model_deployments = [
    module.common_models.gpt_5_2_chat,
    module.common_models.gpt_5_nano,
    module.common_models.text_embedding_3_large,
    module.common_models.gpt_4o_mini
  ]

  application_insights = module.application_insights
  tags                 = var.tags

  # For private networking, add:
  # foundry_subnet_id = "<foundry-private-endpoint-subnet-id>"
}

module "default_project" {
  source = "../modules/ai_foundry_project"

  location      = var.location
  ai_foundry_id = module.foundry.ai_foundry_id
  tags          = var.tags
}

# If you need a second project, start from the commented secondary_project pattern:
# module "secondary_project" {
#   source = "../modules/ai_foundry_project"
#
#   location      = var.location
#   ai_foundry_id = module.foundry.ai_foundry_id
#
#   project_name         = "secondary-project"
#   project_display_name = "Secondary Project"
#   project_description  = "Secondary project"
#   tags                 = var.tags
# }

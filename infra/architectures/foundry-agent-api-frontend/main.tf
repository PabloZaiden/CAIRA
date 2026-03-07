# ---------------------------------------------------------------------
# Copyright (c) Microsoft Corporation. Licensed under the MIT license.
# ---------------------------------------------------------------------

############################################################
# Foundry Agent + API + Frontend (Canonical Conceptual RA)
#
# This single conceptual reference architecture replaces the
# previous basic/basic-private/standard/standard-private
# folder split and exposes those choices as variables.
############################################################

module "common_models" {
  source = "../../modules/common_models"
}

module "naming" {
  source        = "Azure/naming/azurerm"
  version       = "0.4.3"
  suffix        = [local.base_name]
  unique-length = 5
}

resource "azurerm_resource_group" "this" {
  count    = var.resource_group_resource_id == null ? 1 : 0
  location = var.location
  name     = module.naming.resource_group.name_unique
  tags     = var.tags
}

locals {
  base_name                  = var.base_name
  resource_group_resource_id = var.resource_group_resource_id != null ? var.resource_group_resource_id : azurerm_resource_group.this[0].id
  resource_group_name        = var.resource_group_resource_id != null ? provider::azapi::parse_resource_id("Microsoft.Resources/resourceGroups", var.resource_group_resource_id).resource_group_name : azurerm_resource_group.this[0].name

  capability_host_seed_raw = replace(lower(local.base_name), "/[^a-z0-9]/", "")
  capability_host_seed     = length(local.capability_host_seed_raw) > 0 ? local.capability_host_seed_raw : "caira"
  capability_host_suffix_1 = substr(md5("${local.resource_group_resource_id}:capability-host-1"), 0, 6)
  capability_host_suffix_2 = substr(md5("${local.resource_group_resource_id}:capability-host-2"), 0, 6)

  capability_host_cosmos_seed  = substr(local.capability_host_seed, 0, 35)
  capability_host_storage_seed = substr(local.capability_host_seed, 0, 16)
  capability_host_search_seed  = substr(local.capability_host_seed, 0, 50)

  capability_host_cosmos_name_1  = "cos${local.capability_host_cosmos_seed}${local.capability_host_suffix_1}"
  capability_host_storage_name_1 = "st${local.capability_host_storage_seed}${local.capability_host_suffix_1}"
  capability_host_search_name_1  = "srch${local.capability_host_search_seed}${local.capability_host_suffix_1}"

  capability_host_cosmos_name_2  = "cos${local.capability_host_cosmos_seed}${local.capability_host_suffix_2}"
  capability_host_storage_name_2 = "st${local.capability_host_storage_seed}${local.capability_host_suffix_2}"
  capability_host_search_name_2  = "srch${local.capability_host_search_seed}${local.capability_host_suffix_2}"

  use_private_network = var.network_mode == "private"

  resolved_capability_host_mode = var.deployment_profile == "basic" ? "none" : var.capability_host_mode
  use_existing_capability_host  = local.resolved_capability_host_mode == "existing"
  use_new_capability_host       = local.resolved_capability_host_mode == "new"

  enable_secondary_project = var.deployment_profile == "standard" && var.enable_secondary_project

  default_project_connections = local.use_new_capability_host ? module.capability_host_resources_1[0].connections : (local.use_existing_capability_host ? module.capability_host_resources_existing[0].connections : null)

  secondary_project_connections = local.enable_secondary_project ? (
    local.use_new_capability_host ? module.capability_host_resources_2[0].connections : local.default_project_connections
  ) : null
}

module "capability_host_resources_existing" {
  count  = local.use_existing_capability_host ? 1 : 0
  source = "../../modules/existing_resources_agent_capability_host_connections"

  location                   = var.location
  resource_group_resource_id = var.existing_capability_host_resource_group_id
  cosmosdb_account_name      = var.existing_cosmosdb_account_name
  storage_account_name       = var.existing_storage_account_name
  search_service_name        = var.existing_search_service_name
}

module "capability_host_resources_1" {
  count  = local.use_new_capability_host ? 1 : 0
  source = "../../modules/new_resources_agent_capability_host_connections"

  location                   = var.location
  resource_group_resource_id = local.resource_group_resource_id
  tags                       = var.tags

  cosmos_db_account_name = local.capability_host_cosmos_name_1
  storage_account_name   = local.capability_host_storage_name_1
  ai_search_name         = local.capability_host_search_name_1
}

module "capability_host_resources_2" {
  count  = local.use_new_capability_host && local.enable_secondary_project ? 1 : 0
  source = "../../modules/new_resources_agent_capability_host_connections"

  location                   = var.location
  resource_group_resource_id = local.resource_group_resource_id
  tags                       = var.tags

  cosmos_db_account_name = local.capability_host_cosmos_name_2
  storage_account_name   = local.capability_host_storage_name_2
  ai_search_name         = local.capability_host_search_name_2
}

module "ai_foundry" {
  source = "../../modules/ai_foundry"

  resource_group_id = local.resource_group_resource_id
  location          = var.location
  sku               = var.sku
  name              = module.naming.cognitive_account.name_unique

  model_deployments = [
    module.common_models.gpt_5_2_chat,
    module.common_models.gpt_5_nano,
    module.common_models.text_embedding_3_large,
    module.common_models.gpt_4o_mini
  ]

  application_insights = module.application_insights

  agents_subnet_id  = local.use_private_network && local.resolved_capability_host_mode != "none" ? var.agents_subnet_id : null
  foundry_subnet_id = local.use_private_network ? var.foundry_subnet_id : null

  tags = var.tags
}

module "default_project" {
  source = "../../modules/ai_foundry_project"

  location      = var.location
  ai_foundry_id = module.ai_foundry.ai_foundry_id

  agent_capability_host_connections = local.default_project_connections
  tags                              = var.tags
}

module "secondary_project" {
  count  = local.enable_secondary_project ? 1 : 0
  source = "../../modules/ai_foundry_project"

  location      = var.location
  ai_foundry_id = module.ai_foundry.ai_foundry_id

  project_name         = "secondary-project"
  project_display_name = "Secondary Project"
  project_description  = "Secondary project"

  agent_capability_host_connections = local.secondary_project_connections
  tags                              = var.tags
}

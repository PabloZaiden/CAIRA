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

resource "random_string" "foundry_suffix" {
  length  = 6
  upper   = false
  lower   = true
  numeric = true
  special = false
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

  ai_foundry_hash = substr(sha1(local.base_name), 0, 10)
  ai_foundry_name = "cairaai${local.ai_foundry_hash}${random_string.foundry_suffix.result}"
}

module "foundry" {
  source = "../../../infra/modules/ai_foundry"

  resource_group_id = local.resource_group_id
  location          = var.location
  name              = local.ai_foundry_name

  model_deployments = [
    module.common_models.gpt_5_2_chat,
    module.common_models.gpt_5_nano,
    module.common_models.text_embedding_3_large,
    module.common_models.gpt_4o_mini
  ]

  application_insights          = module.application_insights
  tags                          = var.tags
  foundry_subnet_id             = local.effective_foundry_subnet_id
  agents_subnet_id              = local.effective_agents_subnet_id
  enable_agents_vnet_injection  = local.testing_capability_host_enabled
  enable_agents_capability_host = local.testing_capability_host_enabled
}

module "default_project" {
  source = "../../../infra/modules/ai_foundry_project"

  location                          = var.location
  ai_foundry_id                     = module.foundry.ai_foundry_id
  tags                              = var.tags
  agent_capability_host_connections = local.effective_agent_capability_host_connections

  depends_on = [module.foundry]
}

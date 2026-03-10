module "agent_app" {
  source = "../../../../strategy-builder/infra/modules/container_app"

  name                         = "${local.app_prefix}-agent"
  container_name               = "agent"
  resource_group_name          = local.resource_group_name
  container_app_environment_id = module.container_apps_environment.id
  image                        = local.resolved_agent_image
  target_port                  = 3000
  transport                    = "http"
  enable_registry_auth         = var.enable_registry_auth
  registry_server              = module.container_registry.login_server
  environment_variables        = merge(local.app_common_env, var.agent_env, local.agent_openai_endpoint_env, { PORT = "3000" })
  tags                         = var.tags
}

resource "azurerm_role_assignment" "agent_acr_pull" {
  scope                            = module.container_registry.id
  role_definition_name             = "AcrPull"
  principal_id                     = module.agent_app.principal_id
  skip_service_principal_aad_check = true
}

resource "azurerm_role_assignment" "agent_openai_user" {
  scope                            = module.foundry.ai_foundry_id
  role_definition_name             = "Cognitive Services OpenAI User"
  principal_id                     = module.agent_app.principal_id
  skip_service_principal_aad_check = true
}

resource "azurerm_role_assignment" "agent_ai_user" {
  scope                            = module.foundry.ai_foundry_id
  role_definition_name             = "Azure AI User"
  principal_id                     = module.agent_app.principal_id
  skip_service_principal_aad_check = true
}

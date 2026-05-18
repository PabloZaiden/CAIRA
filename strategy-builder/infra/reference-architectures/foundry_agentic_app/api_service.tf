# Keep the API as a separate layer in the default sample so users and agents can
# either keep it, delete it, or fold that responsibility into another service.

module "api_app" {
  source = "../../modules/container_app"

  name                         = "${local.app_prefix}-api"
  container_name               = "api"
  resource_group_name          = local.resource_group_name
  container_app_environment_id = module.container_apps_environment.id
  image                        = local.resolved_api_image
  target_port                  = local.resolved_api_port
  transport                    = "http"
  enable_registry_auth         = var.enable_registry_auth
  registry_server              = module.container_registry.login_server
  environment_variables = merge(
    var.api_env,
    {
      PORT              = "4000"
      AGENT_SERVICE_URL = module.agent_app.url
    }
  )
  tags = var.tags
}

resource "azurerm_role_assignment" "api_acr_pull" {
  scope                            = module.container_registry.id
  role_definition_name             = "AcrPull"
  principal_id                     = module.api_app.principal_id
  skip_service_principal_aad_check = true
}

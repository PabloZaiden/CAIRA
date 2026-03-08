module "frontend_app" {
  source = "../../../infra/modules/container_app"

  name                         = "${local.app_prefix}-frontend"
  container_name               = "frontend"
  resource_group_name          = local.resource_group_name
  container_app_environment_id = module.container_apps_environment.id
  image                        = local.resolved_frontend_image
  target_port                  = 8080
  transport                    = "auto"
  external_enabled             = local.effective_frontend_external_enabled
  allowed_cidrs                = local.effective_frontend_allowed_cidrs
  enable_registry_auth         = var.enable_registry_auth
  registry_server              = module.container_registry.login_server
  environment_variables = merge(
    var.frontend_env,
    {
      PORT         = "8080"
      API_BASE_URL = module.api_app.url
    }
  )
  tags = var.tags
}

resource "azurerm_role_assignment" "frontend_acr_pull" {
  scope                            = module.container_registry.id
  role_definition_name             = "AcrPull"
  principal_id                     = module.frontend_app.principal_id
  skip_service_principal_aad_check = true
}

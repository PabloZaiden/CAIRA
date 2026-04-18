data "azurerm_client_config" "auth" {}

resource "random_uuid" "api_auth_role_id" {}

resource "random_uuid" "agent_auth_role_id" {}

locals {
  api_auth_identifier_uri   = "api://${local.app_prefix}-api-auth"
  agent_auth_identifier_uri = "api://${local.app_prefix}-agent-auth"
}

resource "azuread_application" "api_auth" {
  identifier_uris  = [local.api_auth_identifier_uri]
  display_name     = "${local.app_prefix}-api-auth"
  sign_in_audience = "AzureADMyOrg"

  api {
    requested_access_token_version = 2
  }

  app_role {
    allowed_member_types = ["Application"]
    description          = "Allows the CAIRA frontend BFF to call the CAIRA API."
    display_name         = "Call CAIRA API"
    enabled              = true
    id                   = random_uuid.api_auth_role_id.result
    value                = "Caira.Api.Access"
  }
}

resource "azuread_service_principal" "api_auth" {
  count = var.enable_service_auth ? 1 : 0

  client_id                    = azuread_application.api_auth.client_id
  app_role_assignment_required = true
}

resource "azuread_application" "agent_auth" {
  identifier_uris  = [local.agent_auth_identifier_uri]
  display_name     = "${local.app_prefix}-agent-auth"
  sign_in_audience = "AzureADMyOrg"

  api {
    requested_access_token_version = 2
  }

  app_role {
    allowed_member_types = ["Application"]
    description          = "Allows the CAIRA API to call the CAIRA agent container."
    display_name         = "Call CAIRA agent"
    enabled              = true
    id                   = random_uuid.agent_auth_role_id.result
    value                = "Caira.Agent.Access"
  }
}

resource "azuread_service_principal" "agent_auth" {
  count = var.enable_service_auth ? 1 : 0

  client_id                    = azuread_application.agent_auth.client_id
  app_role_assignment_required = true
}

resource "time_sleep" "wait_for_managed_identity_propagation" {
  count = var.enable_service_auth ? 1 : 0

  depends_on = [
    module.frontend_app,
    module.api_app,
    module.agent_app
  ]

  create_duration = "30s"
}

data "azuread_service_principal" "frontend_managed_identity" {
  count = var.enable_service_auth ? 1 : 0

  object_id = module.frontend_app.principal_id

  depends_on = [time_sleep.wait_for_managed_identity_propagation]
}

data "azuread_service_principal" "api_managed_identity" {
  count = var.enable_service_auth ? 1 : 0

  object_id = module.api_app.principal_id

  depends_on = [time_sleep.wait_for_managed_identity_propagation]
}

resource "azuread_app_role_assignment" "frontend_to_api" {
  count = var.enable_service_auth ? 1 : 0

  principal_object_id = module.frontend_app.principal_id
  resource_object_id  = azuread_service_principal.api_auth[0].object_id
  app_role_id         = random_uuid.api_auth_role_id.result

  depends_on = [time_sleep.wait_for_managed_identity_propagation]
}

resource "azuread_app_role_assignment" "api_to_agent" {
  count = var.enable_service_auth ? 1 : 0

  principal_object_id = module.api_app.principal_id
  resource_object_id  = azuread_service_principal.agent_auth[0].object_id
  app_role_id         = random_uuid.agent_auth_role_id.result

  depends_on = [time_sleep.wait_for_managed_identity_propagation]
}

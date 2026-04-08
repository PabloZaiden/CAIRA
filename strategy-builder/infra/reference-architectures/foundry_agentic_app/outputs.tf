output "ai_foundry_id" {
  description = "The resource ID of the AI Foundry account."
  value       = module.foundry.ai_foundry_id
}

output "ai_foundry_name" {
  description = "The name of the AI Foundry account."
  value       = module.foundry.ai_foundry_name
}

output "ai_foundry_endpoint" {
  description = "The endpoint URL of the AI Foundry account."
  value       = module.foundry.ai_foundry_endpoint
}

output "ai_foundry_default_project_id" {
  description = "The resource ID of the default AI Foundry project."
  value       = module.default_project.ai_foundry_project_id
}

output "ai_foundry_default_project_name" {
  description = "The name of the default AI Foundry project."
  value       = module.default_project.ai_foundry_project_name
}

output "ai_foundry_default_project_identity_principal_id" {
  description = "The principal ID of the default AI Foundry project identity."
  value       = module.default_project.ai_foundry_project_identity_principal_id
}

output "resource_group_id" {
  description = "The resource ID of the resource group."
  value       = local.resource_group_resource_id
}

output "resource_group_name" {
  description = "The resource group name."
  value       = local.resource_group_name
}

output "application_insights_id" {
  description = "The resource ID of the Application Insights instance."
  value       = module.application_insights.resource_id
}

output "log_analytics_workspace_id" {
  description = "The resource ID of the Log Analytics workspace."
  value       = azurerm_log_analytics_workspace.this.id
}

output "acr_name" {
  description = "The Azure Container Registry name."
  value       = module.container_registry.name
}

output "acr_login_server" {
  description = "The Azure Container Registry login server."
  value       = module.container_registry.login_server
}

output "container_app_environment_name" {
  description = "The Azure Container Apps environment name."
  value       = module.container_apps_environment.name
}

output "container_app_environment_default_domain" {
  description = "The default DNS domain assigned to the Azure Container Apps environment."
  value       = module.container_apps_environment.default_domain
}

output "container_app_environment_static_ip_address" {
  description = "The static IP address assigned to the Azure Container Apps environment."
  value       = module.container_apps_environment.static_ip_address
}

output "auth_tenant_id" {
  description = "Entra tenant ID used to issue and validate internal CAIRA service tokens."
  value       = data.azurerm_client_config.auth.tenant_id
}

output "api_token_scope" {
  description = "Scope used by the frontend BFF when calling the API."
  value       = "api://${azuread_application.api_auth.client_id}/.default"
}

output "agent_token_scope" {
  description = "Scope used by the API when calling the agent container."
  value       = "api://${azuread_application.agent_auth.client_id}/.default"
}

output "api_inbound_allowed_audiences" {
  description = "Accepted audiences for inbound access tokens presented to the API."
  value = [
    azuread_application.api_auth.client_id,
    "api://${azuread_application.api_auth.client_id}"
  ]
}

output "agent_inbound_allowed_audiences" {
  description = "Accepted audiences for inbound access tokens presented to the agent container."
  value = [
    azuread_application.agent_auth.client_id,
    "api://${azuread_application.agent_auth.client_id}"
  ]
}

output "api_inbound_allowed_caller_app_ids" {
  description = "Caller application IDs accepted by the API for frontend BFF traffic."
  value       = var.enable_registry_auth ? [data.azuread_service_principal.frontend_managed_identity[0].client_id] : []
}

output "agent_inbound_allowed_caller_app_ids" {
  description = "Caller application IDs accepted by the agent container for API traffic."
  value       = var.enable_registry_auth ? [data.azuread_service_principal.api_managed_identity[0].client_id] : []
}

output "agent_internal_fqdn" {
  description = "Internal FQDN for the agent container app."
  value       = module.agent_app.fqdn
}

output "api_internal_fqdn" {
  description = "Internal FQDN for the API container app."
  value       = module.api_app.fqdn
}

output "frontend_url" {
  description = "The frontend URL for the sample reference architecture."
  value       = module.frontend_app.url
}

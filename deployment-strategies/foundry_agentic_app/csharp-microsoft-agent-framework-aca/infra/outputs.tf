output "resource_group_name" {
  description = "Resource group that hosts all strategy resources."
  value       = local.resource_group_name
}

output "container_app_environment_name" {
  description = "Container Apps environment name."
  value       = module.container_apps_environment.name
}

output "container_app_environment_default_domain" {
  description = "Default DNS domain assigned to the Container Apps environment."
  value       = module.container_apps_environment.default_domain
}

output "container_app_environment_static_ip_address" {
  description = "Static IP address assigned to the Container Apps environment."
  value       = module.container_apps_environment.static_ip_address
}

output "acr_name" {
  description = "Azure Container Registry name."
  value       = module.container_registry.name
}

output "acr_login_server" {
  description = "ACR login server."
  value       = module.container_registry.login_server
}

output "ai_foundry_id" {
  description = "Azure AI / Foundry account resource ID."
  value       = module.foundry.ai_foundry_id
}

output "ai_foundry_name" {
  description = "Azure AI / Foundry account name."
  value       = module.foundry.ai_foundry_name
}

output "ai_foundry_default_project_name" {
  description = "Default AI Foundry project name."
  value       = module.default_project.ai_foundry_project_name
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
  description = "Frontend URL."
  value       = module.frontend_app.url
}

output "application_insights_connection_string" {
  description = "Application Insights connection string used by the sample services."
  sensitive   = true
  value       = module.application_insights.connection_string
}

output "apim_gateway_name" {
  description = "Optional API Management gateway name when AI gateway is enabled."
  value       = var.enable_apim_ai_gateway ? azurerm_api_management.ai_gateway[0].name : null
}

output "apim_gateway_url" {
  description = "Optional API Management gateway URL when AI gateway is enabled."
  value       = var.enable_apim_ai_gateway ? azurerm_api_management.ai_gateway[0].gateway_url : null
}

output "apim_openai_api_base_url" {
  description = "Optional API Management OpenAI-style API base URL when AI gateway is enabled."
  value       = var.enable_apim_ai_gateway ? "${azurerm_api_management.ai_gateway[0].gateway_url}/openai" : null
}

output "apim_chat_completions_url_template" {
  description = "Optional API Management chat completions URL template with deploymentId and api-version placeholders."
  value       = var.enable_apim_ai_gateway ? "${azurerm_api_management.ai_gateway[0].gateway_url}/openai/deployments/{deploymentId}/chat/completions?api-version={api-version}" : null
}

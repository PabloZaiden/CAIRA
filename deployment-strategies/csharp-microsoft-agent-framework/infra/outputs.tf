output "resource_group_name" {
  description = "Resource group that hosts all strategy resources."
  value       = local.resource_group_name
}

output "container_app_environment_name" {
  description = "Container Apps environment name."
  value       = module.container_apps_environment.name
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

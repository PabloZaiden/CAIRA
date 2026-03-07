output "resource_group_name" {
  description = "Resource group that hosts all sample resources."
  value       = azurerm_resource_group.this.name
}

output "container_app_environment_name" {
  description = "Container Apps environment name."
  value       = azurerm_container_app_environment.this.name
}

output "acr_name" {
  description = "Azure Container Registry name."
  value       = module.registry.name
}

output "acr_login_server" {
  description = "ACR login server."
  value       = module.registry.login_server
}

output "agent_internal_fqdn" {
  description = "Internal FQDN for the agent container app."
  value       = var.deploy_apps ? azurerm_container_app.agent[0].ingress[0].fqdn : null
}

output "api_internal_fqdn" {
  description = "Internal FQDN for the API container app."
  value       = var.deploy_apps ? azurerm_container_app.api[0].ingress[0].fqdn : null
}

output "frontend_url" {
  description = "Public frontend URL (when deploy_apps=true)."
  value       = var.deploy_apps ? "https://${azurerm_container_app.frontend[0].ingress[0].fqdn}" : null
}

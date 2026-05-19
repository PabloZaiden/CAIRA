output "resource_group_name" {
  description = "Resource group hosting the app containers."
  value       = azurerm_resource_group.this.name
}

output "container_app_environment_name" {
  description = "Container Apps environment name."
  value       = azurerm_container_app_environment.this.name
}

output "container_registry_login_server" {
  description = "ACR login server for publishing reference images."
  value       = azurerm_container_registry.this.login_server
}

output "api_fqdn" {
  description = "Internal API FQDN."
  value       = azurerm_container_app.api.ingress[0].fqdn
}

output "frontend_url" {
  description = "Public frontend URL."
  value       = "https://${azurerm_container_app.frontend.ingress[0].fqdn}"
}

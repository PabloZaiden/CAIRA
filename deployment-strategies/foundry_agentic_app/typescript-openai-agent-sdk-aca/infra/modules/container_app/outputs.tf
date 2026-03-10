output "id" {
  description = "Resource ID of the Container App."
  value       = azurerm_container_app.this.id
}

output "name" {
  description = "Name of the Container App."
  value       = azurerm_container_app.this.name
}

output "principal_id" {
  description = "Principal ID of the Container App system-assigned managed identity."
  value       = azurerm_container_app.this.identity[0].principal_id
}

output "fqdn" {
  description = "Ingress FQDN of the Container App, or null when ingress is disabled."
  value       = try(azurerm_container_app.this.ingress[0].fqdn, null)
}

output "url" {
  description = "HTTPS URL of the Container App ingress, or null when ingress is disabled."
  value       = try("https://${azurerm_container_app.this.ingress[0].fqdn}", null)
}

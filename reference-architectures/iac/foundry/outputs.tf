output "resource_group_name" {
  description = "Resource group that contains the Foundry resources."
  value       = azurerm_resource_group.this.name
}

output "ai_foundry_id" {
  description = "Azure AI Foundry account resource ID."
  value       = module.foundry.ai_foundry_id
}

output "ai_foundry_name" {
  description = "Azure AI Foundry account name."
  value       = module.foundry.ai_foundry_name
}

output "application_insights_connection_string" {
  description = "Application Insights connection string for Foundry observability and app telemetry."
  value       = azurerm_application_insights.this.connection_string
  sensitive   = true
}

output "application_insights_name" {
  description = "Application Insights component name for Foundry observability."
  value       = azurerm_application_insights.this.name
}

output "log_analytics_workspace_name" {
  description = "Log Analytics workspace receiving Foundry diagnostics."
  value       = azurerm_log_analytics_workspace.this.name
}

output "azure_openai_endpoint" {
  description = "OpenAI-compatible endpoint for model SDK clients."
  value       = "https://${module.foundry.ai_foundry_name}.cognitiveservices.azure.com/"
}

output "default_project_id" {
  description = "Default Foundry project resource ID."
  value       = module.foundry.ai_foundry_project_id["default"]
}

output "default_project_name" {
  description = "Default Foundry project name."
  value       = module.foundry.ai_foundry_project_name["default"]
}

output "default_model_deployment" {
  description = "Default model deployment name used by the app references."
  value       = "gpt-5-mini"
}

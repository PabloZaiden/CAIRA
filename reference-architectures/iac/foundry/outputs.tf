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

# ---------------------------------------------------------------------
# Copyright (c) Microsoft Corporation. Licensed under the MIT license.
# ---------------------------------------------------------------------

output "ai_foundry_id" {
  description = "The resource ID of the AI Foundry account."
  value       = module.ai_foundry.ai_foundry_id
}

output "ai_foundry_name" {
  description = "The name of the AI Foundry account."
  value       = module.ai_foundry.ai_foundry_name
}

output "ai_foundry_endpoint" {
  description = "The endpoint URL of the AI Foundry account."
  value       = module.ai_foundry.ai_foundry_endpoint
}

output "ai_foundry_model_deployments_ids" {
  description = "The IDs of the AI Foundry model deployments."
  value       = module.ai_foundry.ai_foundry_model_deployments_ids
}

output "resource_group_id" {
  description = "The resource ID of the resource group."
  value       = local.resource_group_resource_id
}

output "resource_group_name" {
  description = "The name of the resource group."
  value       = local.resource_group_name
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
  description = "The principal ID of the default project system-assigned managed identity."
  value       = module.default_project.ai_foundry_project_identity_principal_id
}

output "ai_foundry_secondary_project_id" {
  description = "The resource ID of the secondary AI Foundry project (null when disabled)."
  value       = try(module.secondary_project[0].ai_foundry_project_id, null)
}

output "ai_foundry_secondary_project_name" {
  description = "The name of the secondary AI Foundry project (null when disabled)."
  value       = try(module.secondary_project[0].ai_foundry_project_name, null)
}

output "ai_foundry_secondary_project_identity_principal_id" {
  description = "The principal ID of the secondary project managed identity (null when disabled)."
  value       = try(module.secondary_project[0].ai_foundry_project_identity_principal_id, null)
}

output "agent_capability_host_connections_default" {
  description = "Capability host connections used by the default project (null when capability hosts are disabled)."
  value       = local.default_project_connections
}

output "agent_capability_host_connections_secondary" {
  description = "Capability host connections used by the secondary project (null when disabled)."
  value       = local.secondary_project_connections
}

output "application_insights_id" {
  description = "The resource ID of the Application Insights instance."
  value       = module.application_insights.resource_id
}

output "log_analytics_workspace_id" {
  description = "The resource ID of the Log Analytics workspace."
  value       = azurerm_log_analytics_workspace.this.id
}

output "effective_deployment_profile" {
  description = "Resolved deployment profile."
  value       = var.deployment_profile
}

output "effective_network_mode" {
  description = "Resolved network mode."
  value       = var.network_mode
}

output "effective_capability_host_mode" {
  description = "Resolved capability host mode after profile normalization."
  value       = local.resolved_capability_host_mode
}

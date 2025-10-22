# ---------------------------------------------------------------------
# Copyright (c) Microsoft Corporation. Licensed under the MIT license.
# ---------------------------------------------------------------------

variable "fsp_resource_group_name" {
  description = "Name of the resource group containing foundry standard private durable test infrastructure"
  type        = string
}

variable "fsp_vnet_name" {
  description = "Name of the foundry standard private durable VNet"
  type        = string
}

variable "connection_subnet_name" {
  description = "Name of the connections subnet (for AI Foundry private endpoints)"
  type        = string
  default     = "connections"
}

# NOTE: agent_subnet_name variable removed
# Agent subnets must be created ephemerally using setup_ephemeral module

variable "cognitive_dns_zone_name" {
  description = "Name of the Cognitive Services private DNS zone"
  type        = string
  default     = "privatelink.cognitiveservices.azure.com"
}

variable "ai_services_dns_zone_name" {
  description = "Name of the AI Services private DNS zone"
  type        = string
  default     = "privatelink.services.ai.azure.com"
}

variable "openai_dns_zone_name" {
  description = "Name of the OpenAI private DNS zone"
  type        = string
  default     = "privatelink.openai.azure.com"
}

variable "fsp_cosmosdb_account_name" {
  description = "Name of the foundry standard private durable Cosmos DB account"
  type        = string
}

variable "fsp_storage_account_name" {
  description = "Name of the foundry standard private durable Storage Account"
  type        = string
}

variable "fsp_search_service_name" {
  description = "Name of the foundry standard private durable AI Search service"
  type        = string
}

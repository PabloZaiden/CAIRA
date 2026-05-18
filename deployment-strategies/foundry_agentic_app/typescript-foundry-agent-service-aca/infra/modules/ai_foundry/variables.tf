# ---------------------------------------------------------------------
# Copyright (c) Microsoft Corporation. Licensed under the MIT license.
# ---------------------------------------------------------------------

variable "name" {
  description = "The name of the AI Foundry resource."
  type        = string
}

variable "location" {
  description = "The Azure region where the AI Foundry resource will be deployed."
  type        = string
}

variable "sku" {
  description = "The SKU for the AI Foundry resource."
  type        = string
  default     = "S0"
}

variable "resource_group_id" {
  description = "The ID of the resource group where the AI Foundry resource will be created."
  type        = string
}

variable "model_deployments" {
  description = "A map of model deployments to be created in the AI Foundry resource."
  type = list(object({
    name    = string
    version = string
    format  = string
    sku = optional(object({
      name     = string
      capacity = number
      }), {
      name     = "GlobalStandard"
      capacity = 50
    })
  }))
}

variable "tags" {
  description = "A list of tags to apply to the AI Foundry resource."
  type        = map(string)
  default     = null
}

variable "agents_subnet_id" {
  description = "Optional subnet ID to inject the AI Foundry Agents capability host."
  type        = string
  default     = null
}

variable "enable_agents_vnet_injection" {
  description = "When true, use agents_subnet_id for Agents network injection instead of creating a public capability host."
  type        = bool
  default     = false
}

variable "enable_agents_capability_host" {
  description = "When true, create the public Agents capability host required for project-level capability-host connections."
  type        = bool
  default     = false
}

variable "foundry_subnet_id" {
  description = "Optional subnet ID to inject the AI Foundry."
  type        = string
  default     = null
}

variable "application_insights" {
  description = "Configuration for Application Insights connection."
  type = object({
    resource_id       = string
    name              = string
    connection_string = string
  })
  nullable  = false
  sensitive = true
}

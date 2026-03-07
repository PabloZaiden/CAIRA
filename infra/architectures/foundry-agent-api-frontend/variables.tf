# ---------------------------------------------------------------------
# Copyright (c) Microsoft Corporation. Licensed under the MIT license.
# ---------------------------------------------------------------------

variable "base_name" {
  type        = string
  description = "Base name used as suffix in the naming module."
  default     = "foundry-agent-api-frontend"
  nullable    = false
}

variable "location" {
  type        = string
  description = "Azure region where resources should be deployed."
  default     = "swedencentral"
  nullable    = false
}

variable "resource_group_resource_id" {
  type        = string
  description = "Resource group ID where resources will be deployed. If null, a new resource group is created."
  default     = null
}

variable "sku" {
  type        = string
  description = "SKU for the AI Foundry account."
  default     = "S0"
}

variable "enable_telemetry" {
  type        = bool
  default     = true
  description = <<DESCRIPTION
Controls whether AVM telemetry and partner attribution are enabled.
If false, telemetry is disabled.
DESCRIPTION
  nullable    = false
}

variable "tags" {
  type        = map(string)
  default     = null
  description = "Optional tags applied to all resources."
}

variable "deployment_profile" {
  type        = string
  description = "Conceptual profile: 'basic' (Foundry only) or 'standard' (Foundry + agent capability host connections)."
  default     = "standard"

  validation {
    condition     = contains(["basic", "standard"], var.deployment_profile)
    error_message = "deployment_profile must be either 'basic' or 'standard'."
  }
}

variable "network_mode" {
  type        = string
  description = "Connectivity posture: 'public' or 'private'."
  default     = "public"

  validation {
    condition     = contains(["public", "private"], var.network_mode)
    error_message = "network_mode must be either 'public' or 'private'."
  }
}

variable "capability_host_mode" {
  type        = string
  description = "How to provide capability host resources for standard profile: 'new', 'existing', or 'none'."
  default     = "new"

  validation {
    condition     = contains(["new", "existing", "none"], var.capability_host_mode)
    error_message = "capability_host_mode must be one of: new, existing, none."
  }

  validation {
    condition     = !(var.deployment_profile == "basic" && var.capability_host_mode != "none")
    error_message = "For deployment_profile='basic', capability_host_mode must be 'none'."
  }
}

variable "enable_secondary_project" {
  type        = bool
  description = "When true and deployment_profile='standard', creates a secondary Foundry project."
  default     = false
}

variable "agents_subnet_id" {
  type        = string
  description = "Subnet ID for agent capability host injection (required for private + standard when capability_host_mode is not 'none')."
  default     = null

  validation {
    condition = !(
      var.network_mode == "private" &&
      var.deployment_profile == "standard" &&
      var.capability_host_mode != "none" &&
      var.agents_subnet_id == null
    )
    error_message = "agents_subnet_id is required when network_mode='private', deployment_profile='standard', and capability_host_mode is not 'none'."
  }
}

variable "foundry_subnet_id" {
  type        = string
  description = "Subnet ID used for AI Foundry private endpoint injection (required for private mode)."
  default     = null

  validation {
    condition     = !(var.network_mode == "private" && var.foundry_subnet_id == null)
    error_message = "foundry_subnet_id is required when network_mode='private'."
  }
}

variable "existing_capability_host_resource_group_id" {
  type        = string
  description = "Resource group ID containing existing Cosmos DB, Storage, and AI Search resources."
  default     = null

  validation {
    condition = !(
      var.capability_host_mode == "existing" &&
      var.existing_capability_host_resource_group_id == null
    )
    error_message = "existing_capability_host_resource_group_id is required when capability_host_mode='existing'."
  }
}

variable "existing_cosmosdb_account_name" {
  type        = string
  description = "Existing Cosmos DB account name used for capability host connections."
  default     = null

  validation {
    condition     = !(var.capability_host_mode == "existing" && var.existing_cosmosdb_account_name == null)
    error_message = "existing_cosmosdb_account_name is required when capability_host_mode='existing'."
  }
}

variable "existing_storage_account_name" {
  type        = string
  description = "Existing Storage account name used for capability host connections."
  default     = null

  validation {
    condition     = !(var.capability_host_mode == "existing" && var.existing_storage_account_name == null)
    error_message = "existing_storage_account_name is required when capability_host_mode='existing'."
  }
}

variable "existing_search_service_name" {
  type        = string
  description = "Existing AI Search service name used for capability host connections."
  default     = null

  validation {
    condition     = !(var.capability_host_mode == "existing" && var.existing_search_service_name == null)
    error_message = "existing_search_service_name is required when capability_host_mode='existing'."
  }
}

variable "monitor_private_link_scope_resource_id" {
  type        = string
  description = "Optional Azure Monitor Private Link Scope resource ID used for private monitoring integration."
  default     = null
}

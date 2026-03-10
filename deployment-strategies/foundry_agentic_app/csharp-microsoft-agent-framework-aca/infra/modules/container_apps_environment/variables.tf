variable "name" {
  description = "Name of the Azure Container Apps environment."
  type        = string
  nullable    = false
}

variable "location" {
  description = "Azure location for the Container Apps environment."
  type        = string
  nullable    = false
}

variable "resource_group_name" {
  description = "Resource group that hosts the Container Apps environment."
  type        = string
  nullable    = false
}

variable "log_analytics_workspace_id" {
  description = "Log Analytics workspace ID used by the Container Apps environment."
  type        = string
  nullable    = false
}

variable "infrastructure_subnet_id" {
  description = "Optional subnet ID for a private Container Apps environment."
  type        = string
  default     = null
}

variable "tags" {
  description = "Optional tags applied to the Container Apps environment."
  type        = map(string)
  default     = {}
}

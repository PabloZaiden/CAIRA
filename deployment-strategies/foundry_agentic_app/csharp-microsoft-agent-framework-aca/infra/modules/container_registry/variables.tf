variable "name" {
  description = "Name of the Azure Container Registry."
  type        = string
  nullable    = false
}

variable "location" {
  description = "Azure location for the Azure Container Registry."
  type        = string
  nullable    = false
}

variable "resource_group_name" {
  description = "Resource group that hosts the Azure Container Registry."
  type        = string
  nullable    = false
}

variable "sku" {
  description = "SKU for the Azure Container Registry."
  type        = string
  default     = "Basic"
  nullable    = false
}

variable "admin_enabled" {
  description = "When true, enables the admin user on the Azure Container Registry."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Optional tags applied to the Azure Container Registry."
  type        = map(string)
  default     = {}
}

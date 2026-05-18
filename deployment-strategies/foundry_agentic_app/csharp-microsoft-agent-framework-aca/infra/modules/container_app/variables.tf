variable "name" {
  description = "Name of the Azure Container App."
  type        = string
  nullable    = false
}

variable "container_name" {
  description = "Optional container name inside the Container App. Defaults to the app name."
  type        = string
  default     = null
}

variable "resource_group_name" {
  description = "Resource group that hosts the Container App."
  type        = string
  nullable    = false
}

variable "container_app_environment_id" {
  description = "Container Apps environment ID used by the Container App."
  type        = string
  nullable    = false
}

variable "image" {
  description = "Container image for the Container App."
  type        = string
  nullable    = false
}

variable "target_port" {
  description = "Port exposed by the application container."
  type        = number
}

variable "transport" {
  description = "Ingress transport mode."
  type        = string
  default     = "auto"

  validation {
    condition     = contains(["auto", "http", "http2", "tcp"], var.transport)
    error_message = "transport must be one of auto, http, http2, or tcp."
  }
}

variable "cpu" {
  description = "CPU allocation for the app container."
  type        = number
  default     = 0.5
}

variable "memory" {
  description = "Memory allocation for the app container."
  type        = string
  default     = "1Gi"
  nullable    = false
}

variable "min_replicas" {
  description = "Minimum number of replicas."
  type        = number
  default     = 1
}

variable "max_replicas" {
  description = "Maximum number of replicas."
  type        = number
  default     = 1
}

variable "environment_variables" {
  description = "Environment variables injected into the app container."
  type        = map(string)
  default     = {}
}

variable "ingress_enabled" {
  description = "When true, creates ingress for the Container App."
  type        = bool
  default     = true
}

variable "external_enabled" {
  description = "When true, exposes ingress publicly."
  type        = bool
  default     = false
}

variable "allow_insecure_connections" {
  description = "When true, allows insecure ingress connections."
  type        = bool
  default     = false
}

variable "allowed_cidrs" {
  description = "Optional CIDR allowlist applied to public ingress."
  type        = list(string)
  default     = []

  validation {
    condition     = var.external_enabled || length(var.allowed_cidrs) == 0
    error_message = "allowed_cidrs can only be set when external_enabled is true."
  }
}

variable "enable_registry_auth" {
  description = "When true, uses the app managed identity for Azure Container Registry auth."
  type        = bool
  default     = false
}

variable "registry_server" {
  description = "Container Registry login server used when enable_registry_auth is true."
  type        = string
  default     = null

  validation {
    condition     = !var.enable_registry_auth || (var.registry_server != null && trimspace(var.registry_server) != "")
    error_message = "registry_server must be set when enable_registry_auth is true."
  }
}

variable "tags" {
  description = "Optional tags applied to the Container App."
  type        = map(string)
  default     = {}
}

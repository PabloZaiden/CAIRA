variable "project_name" {
  type        = string
  description = "Base project name for the sample reference architecture."
  default     = "foundry-agentic-app"
}

variable "location" {
  type        = string
  description = "Azure region where the sample reference architecture should be deployed."
  default     = "swedencentral"
}

variable "resource_group_resource_id" {
  type        = string
  description = "Existing resource group ID where the sample should be deployed. If null, a new resource group is created."
  default     = null
}

variable "sku" {
  type        = string
  description = "SKU for the Azure AI Foundry account."
  default     = "S0"
}

variable "allowed_cidr" {
  type        = string
  description = "CIDR allowed to access the public frontend ingress while using the default public sample."
  default     = "127.0.0.1/32"
}

variable "enable_telemetry" {
  type        = bool
  description = "Controls whether AVM telemetry and partner attribution are enabled."
  default     = true
}

variable "enable_registry_auth" {
  type        = bool
  description = "When true, container apps use managed identity auth against ACR."
  default     = false
}

variable "enable_service_auth" {
  type        = bool
  description = "When true, create the Entra service-to-service auth resources used by the frontend, API, and agent containers."
  default     = true
}

variable "agent_image" {
  type        = string
  description = "Container image for the agent app. When empty, the bootstrap image is used."
  default     = ""
}

variable "api_image" {
  type        = string
  description = "Container image for the API app. When empty, the bootstrap image is used."
  default     = ""
}

variable "frontend_image" {
  type        = string
  description = "Container image for the frontend app. When empty, the bootstrap image is used."
  default     = ""
}

variable "agent_env" {
  type        = map(string)
  description = "Extra environment variables for the agent app."
  default     = {}
}

variable "api_env" {
  type        = map(string)
  description = "Extra environment variables for the API app."
  default     = {}
}

variable "frontend_env" {
  type        = map(string)
  description = "Extra environment variables for the frontend app."
  default     = {}
}

variable "tags" {
  type        = map(string)
  description = "Optional tags applied to all resources."
  default     = {}
}

variable "project_name" {
  description = "Base name for resources."
  type        = string
  default     = "caira-sample"
}

variable "location" {
  description = "Azure location for all resources."
  type        = string
  default     = "swedencentral"
}

variable "allowed_cidr" {
  description = "CIDR allowed to access the public frontend ingress (for example 1.2.3.4/32)."
  type        = string
}

variable "enable_telemetry" {
  description = "Controls whether AVM telemetry and partner attribution are enabled."
  type        = bool
  default     = true
}

variable "enable_registry_auth" {
  description = "When true, container apps use managed identity auth against ACR."
  type        = bool
  default     = false
}

variable "enable_service_auth" {
  description = "When true, create the Entra service-to-service auth resources used by the frontend, API, and agent containers."
  type        = bool
  default     = true
}

variable "agent_image" {
  description = "Container image for the agent app. When empty, the bootstrap image is used."
  type        = string
  default     = ""
}

variable "api_image" {
  description = "Container image for the API app. When empty, the bootstrap image is used."
  type        = string
  default     = ""
}

variable "frontend_image" {
  description = "Container image for the frontend/BFF app. When empty, the bootstrap image is used."
  type        = string
  default     = ""
}

variable "agent_env" {
  description = "Extra environment variables for the agent app."
  type        = map(string)
  default     = {}
}

variable "api_env" {
  description = "Extra environment variables for the API app."
  type        = map(string)
  default     = {}
}

variable "frontend_env" {
  description = "Extra environment variables for the frontend/BFF app."
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Extra tags applied to all resources."
  type        = map(string)
  default     = {}
}

variable "enable_apim_ai_gateway" {
  description = "When true, deploy an optional API Management AI gateway for Foundry endpoints."
  type        = bool
  default     = false
}

variable "apim_sku_name" {
  description = "API Management SKU name to use when the optional AI gateway is enabled."
  type        = string
  default     = "Developer_1"
}

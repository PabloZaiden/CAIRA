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

variable "deploy_apps" {
  description = "When false, only shared infra (RG, Log Analytics, ACA env, ACR) is created."
  type        = bool
  default     = false
}

variable "enable_registry_auth" {
  description = "When true, container apps use managed identity auth against ACR."
  type        = bool
  default     = true
}

variable "agent_image" {
  description = "Container image for the agent app (used when deploy_apps=true)."
  type        = string
  default     = ""
}

variable "api_image" {
  description = "Container image for the API app (used when deploy_apps=true)."
  type        = string
  default     = ""
}

variable "frontend_image" {
  description = "Container image for the frontend/BFF app (used when deploy_apps=true)."
  type        = string
  default     = ""
}

variable "ai_resource_id" {
  description = "Azure AI / Cognitive Services account resource ID used for agent role assignments."
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

variable "project_name" {
  description = "Base name for app-hosting resources."
  type        = string
  default     = "caira"
}

variable "location" {
  description = "Azure region for all resources."
  type        = string
  default     = "swedencentral"
}

variable "api_image" {
  description = "Container image for the unified API/agent app."
  type        = string
  default     = "mcr.microsoft.com/k8se/quickstart:latest"
}

variable "frontend_image" {
  description = "Container image for the React frontend/BFF app."
  type        = string
  default     = "mcr.microsoft.com/k8se/quickstart:latest"
}

variable "azure_openai_endpoint" {
  description = "OpenAI-compatible Foundry endpoint, usually from ../foundry output azure_openai_endpoint."
  type        = string
}

variable "agent_model" {
  description = "Model deployment name passed to the API container."
  type        = string
  default     = "gpt-5-mini"
}

variable "frontend_allowed_cidrs" {
  description = "CIDRs allowed to reach the public frontend. Empty allows public access."
  type        = list(string)
  default     = []
}

variable "api_env" {
  description = "Additional API container environment variables."
  type        = map(string)
  default     = {}
}

variable "frontend_env" {
  description = "Additional frontend container environment variables."
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Tags applied to resources."
  type        = map(string)
  default     = {}
}

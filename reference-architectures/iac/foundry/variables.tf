variable "project_name" {
  description = "Base name for the Foundry resources."
  type        = string
  default     = "caira"
}

variable "location" {
  description = "Azure region for all resources."
  type        = string
  default     = "swedencentral"
}

variable "tags" {
  description = "Tags applied to resources."
  type        = map(string)
  default     = {}
}

variable "enable_telemetry" {
  description = "Controls whether Azure Verified Module telemetry is enabled."
  type        = bool
  default     = true
}

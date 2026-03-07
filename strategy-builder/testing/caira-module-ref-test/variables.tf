# Variables for the CAIRA module reference test.
# These are dummy values — this config is never applied, only validated.

variable "name" {
  description = "AI Foundry resource name"
  type        = string
  default     = "test-ai-foundry"
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "eastus2"
}

variable "resource_group_id" {
  description = "Resource group ID"
  type        = string
  default     = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/test-rg"
}

variable "model_deployments" {
  description = "Model deployments"
  type = list(object({
    name    = string
    version = string
    format  = string
    sku = optional(object({
      name     = string
      capacity = number
    }))
  }))
  default = [
    {
      name    = "gpt-5.2-chat"
      version = "2024-08-06"
      format  = "OpenAI"
    }
  ]
}

variable "application_insights" {
  description = "Application Insights config"
  type = object({
    resource_id       = string
    name              = string
    connection_string = string
  })
  sensitive = true
  default = {
    resource_id       = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/test-rg/providers/Microsoft.Insights/components/test-appinsights"
    name              = "test-appinsights"
    connection_string = "InstrumentationKey=00000000-0000-0000-0000-000000000000"
  }
}

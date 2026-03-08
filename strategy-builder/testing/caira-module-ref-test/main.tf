# testing/caira-module-ref-test/main.tf
#
# Validates that Terraform can reference CAIRA modules from the consolidated repo using
# relative source paths. This is NOT a deployable config — it exists only
# to verify that `terraform init && terraform validate` succeed.

terraform {
  required_version = ">= 1.13, < 2.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.40"
    }
    azapi = {
      source  = "Azure/azapi"
      version = "~> 2.6"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
    time = {
      source  = "hashicorp/time"
      version = "~> 0.13"
    }
  }
}

provider "azurerm" {
  features {}
}

module "ai_foundry" {
  source = "../../infra/modules/ai_foundry"

  name              = var.name
  location          = var.location
  resource_group_id = var.resource_group_id
  model_deployments = var.model_deployments

  application_insights = var.application_insights
}

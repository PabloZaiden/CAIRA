# testing/caira-module-ref-test/main.tf
#
# Validates that Terraform can reference the remaining CAIRA modules from the
# consolidated repo using relative source paths. This is NOT a deployable config.

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

module "common_models" {
  source = "../../infra/modules/common_models"
}

# ---------------------------------------------------------------------
# Copyright (c) Microsoft Corporation. Licensed under the MIT license.
# ---------------------------------------------------------------------

# =============================================================================
# Foundry Basic Private Reference Architecture - Acceptance Tests
# =============================================================================
# These tests validate the foundry_basic_private configuration using plan-only operations.
# They ensure variables, conditional logic, and resource planning work correctly
# including proper private networking setup.
#
# APPROACH: Uses data sources to lookup durable infrastructure pool instead of
# creating ephemeral resources. This eliminates 8-12 minute setup overhead per test run.
# =============================================================================

# Lookup the durable infrastructure pool instead of creating ephemeral resources
# The data module will use TF_VAR_ environment variables for resource names
run "data" {
  command = plan

  module {
    source = "./tests/integration/data"
  }
}

# Default Configuration with Private Networking
# Verifies that the foundry_basic_private architecture works with minimal configuration
run "testacc_foundry_basic_private_default_config" {
  command = plan

  # Verify location variable is properly set
  assert {
    condition     = var.location == "swedencentral"
    error_message = "The location variable should be 'swedencentral'"
  }

  # Verify default behavior: new resource group should be created
  assert {
    condition     = var.resource_group_resource_id == null
    error_message = "Resource group resource ID should be null for default config"
  }

  # Verify conditional resource creation: exactly one RG planned when none provided
  assert {
    condition     = length(azurerm_resource_group.this) == 1
    error_message = "Exactly one resource group should be planned for creation when none provided"
  }

  # Verify default SKU is applied
  assert {
    condition     = var.sku == "S0"
    error_message = "Default SKU should be S0"
  }

  assert {
    condition     = var.enable_telemetry == true
    error_message = "Default telemetry setting should be enabled"
  }

  assert {
    condition     = var.sku == "S0"
    error_message = "Default SKU should be S0"
  }
}

# Existing Resource Group Configuration
# Validates the conditional logic for using an existing resource group
run "testacc_foundry_basic_private_existing_rg" {
  command = plan

  variables {
    foundry_subnet_id          = run.data.connection.id
    resource_group_resource_id = "/subscriptions/12345678-1234-1234-1234-123456789012/resourceGroups/existing-rg"
  }

  # Verify conditional logic: no new RG should be created when existing ID is provided
  assert {
    condition     = length(azurerm_resource_group.this) == 0
    error_message = "No new resource group should be created when existing ID is provided"
  }
}

# Resource Planning Validation
# Ensures resources are properly planned for creation
run "testacc_foundry_basic_private_resource_planning" {
  command = plan

  variables {
    foundry_subnet_id = run.data.connection.id
  }

  # Verify exactly one resource group is planned for creation
  assert {
    condition     = length(azurerm_resource_group.this) == 1
    error_message = "Exactly one resource group should be planned for creation"
  }

  # Verify resource group has the correct location
  assert {
    condition     = azurerm_resource_group.this[0].location == "swedencentral"
    error_message = "Resource group should be planned for creation in the specified location"
  }

  # Verify tags are properly applied (if any are set at the variable level)
  assert {
    condition     = azurerm_resource_group.this[0].tags == var.tags
    error_message = "Resource group tags should match the provided variable tags"
  }
}

# Location Validation
# Tests different Azure regions to ensure the module works across regions
run "testacc_foundry_basic_private_different_location" {
  command = plan

  variables {
    location          = "eastus"
    foundry_subnet_id = run.data.connection.id
  }

  # Verify the location is applied to the resource group planning
  assert {
    condition     = azurerm_resource_group.this[0].location == "eastus"
    error_message = "Resource group should be planned for creation in the specified location"
  }
}

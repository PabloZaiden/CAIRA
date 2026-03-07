# ---------------------------------------------------------------------
# Copyright (c) Microsoft Corporation. Licensed under the MIT license.
# ---------------------------------------------------------------------

test {
  parallel = true
}

run "testacc_default_standard_public" {
  command = plan

  assert {
    condition     = var.deployment_profile == "standard"
    error_message = "Default deployment_profile should be standard."
  }

  assert {
    condition     = var.network_mode == "public"
    error_message = "Default network_mode should be public."
  }

  assert {
    condition     = length(azurerm_resource_group.this) == 1
    error_message = "A resource group should be created when resource_group_resource_id is not provided."
  }
}

run "testacc_basic_public_profile" {
  command = plan

  variables {
    deployment_profile   = "basic"
    network_mode         = "public"
    capability_host_mode = "none"
  }

  assert {
    condition     = var.deployment_profile == "basic"
    error_message = "Expected deployment_profile to be basic."
  }

  assert {
    condition     = var.network_mode == "public"
    error_message = "Expected network_mode to be public."
  }

  assert {
    condition     = local.resolved_capability_host_mode == "none"
    error_message = "Basic profile should resolve capability host mode to none."
  }
}

run "testacc_private_mode_requires_foundry_subnet" {
  command = plan

  variables {
    deployment_profile   = "basic"
    network_mode         = "private"
    capability_host_mode = "none"
  }

  expect_failures = [var.foundry_subnet_id]
}

run "testacc_existing_mode_requires_existing_resources" {
  command = plan

  variables {
    deployment_profile   = "standard"
    network_mode         = "public"
    capability_host_mode = "existing"
  }

  expect_failures = [
    var.existing_capability_host_resource_group_id,
    var.existing_cosmosdb_account_name,
    var.existing_storage_account_name,
    var.existing_search_service_name
  ]
}

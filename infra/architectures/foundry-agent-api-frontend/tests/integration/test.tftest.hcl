# ---------------------------------------------------------------------
# Copyright (c) Microsoft Corporation. Licensed under the MIT license.
# ---------------------------------------------------------------------

run "testint_canonical_apply_smoke" {
  command = apply

  variables {
    deployment_profile       = "standard"
    network_mode             = "public"
    capability_host_mode     = "new"
    enable_secondary_project = false
    tags = {
      environment  = "test"
      architecture = "foundry-agent-api-frontend"
      test_type    = "integration"
    }
  }

  assert {
    condition     = output.ai_foundry_id != null
    error_message = "AI Foundry ID should be populated."
  }

  assert {
    condition     = output.ai_foundry_default_project_id != null
    error_message = "Default project ID should be populated."
  }

  assert {
    condition     = output.resource_group_name != null
    error_message = "Resource group name should be populated."
  }
}

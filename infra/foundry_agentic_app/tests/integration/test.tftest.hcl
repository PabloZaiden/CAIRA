run "testint_default_apply_smoke" {
  command = apply

  variables {
    tags = {
      environment  = "test"
      architecture = "foundry_agentic_app"
      test_type    = "integration"
    }
  }

  assert {
    condition     = output.ai_foundry_id != null
    error_message = "AI Foundry ID should be populated."
  }

  assert {
    condition     = output.resource_group_name != null
    error_message = "Resource group name should be populated."
  }

  assert {
    condition     = output.acr_name != null
    error_message = "ACR name should be populated."
  }

  assert {
    condition     = output.frontend_url != null
    error_message = "Frontend URL should be populated."
  }
}

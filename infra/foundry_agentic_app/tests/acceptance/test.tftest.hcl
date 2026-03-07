test {
  parallel = true
}

run "testacc_default_sample_defaults" {
  command = plan

  assert {
    condition     = var.project_name == "foundry-agentic-app"
    error_message = "Default project_name should remain the simple baseline sample name."
  }

  assert {
    condition     = var.sku == "S0"
    error_message = "Default SKU should remain S0."
  }

  assert {
    condition     = var.allowed_cidr == "127.0.0.1/32"
    error_message = "Default allowed_cidr should stay minimal in the sample."
  }

  assert {
    condition     = var.enable_registry_auth == false
    error_message = "Registry auth should stay opt-in by default."
  }

  assert {
    condition     = var.agent_image == "" && var.api_image == "" && var.frontend_image == ""
    error_message = "Default sample should bootstrap app shells until real images are supplied."
  }

  assert {
    condition     = var.resource_group_resource_id == null
    error_message = "The sample should create its own resource group by default."
  }
}

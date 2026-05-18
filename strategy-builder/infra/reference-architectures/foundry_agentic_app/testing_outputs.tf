# tflint-ignore: terraform_standard_module_structure
output "testing_jumpbox_name" {
  description = "Ephemeral jumpbox VM name used for private test profiles, or null when no jumpbox is deployed."
  value       = try(azurerm_linux_virtual_machine.testing_jumpbox[0].name, null)
}

# tflint-ignore: terraform_standard_module_structure
output "testing_jumpbox_public_ip" {
  description = "Ephemeral jumpbox public IP used for private test profiles, or null when no jumpbox is deployed."
  value       = try(azurerm_public_ip.testing_jumpbox[0].ip_address, null)
}

# tflint-ignore: terraform_standard_module_structure
output "testing_jumpbox_admin_username" {
  description = "Admin username for the ephemeral private-test jumpbox, or null when no jumpbox is deployed."
  value       = try(azurerm_linux_virtual_machine.testing_jumpbox[0].admin_username, null)
}

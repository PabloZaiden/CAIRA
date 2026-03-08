# tflint-ignore: terraform_standard_module_structure
variable "testing_profile" {
  type        = string
  description = "Test-only deployment profile. Use public for the default sample, or private/private-capability-host for durable-pool-backed validation."
  default     = "public"
}

# tflint-ignore: terraform_standard_module_structure
variable "testing_private_pool_resource_group_name" {
  type        = string
  description = "Test-only resource group that contains the durable private-network pool."
  default     = null
}

# tflint-ignore: terraform_standard_module_structure
variable "testing_private_pool_vnet_name" {
  type        = string
  description = "Test-only virtual network name from the durable private-network pool."
  default     = null
}

# tflint-ignore: terraform_standard_module_structure
variable "testing_private_connection_subnet_name" {
  type        = string
  description = "Test-only private endpoint subnet name inside the durable private-network pool."
  default     = "connections"
}

# tflint-ignore: terraform_standard_module_structure
variable "testing_private_container_apps_subnet_cidr" {
  type        = string
  description = "Test-only CIDR for the ephemeral Container Apps infrastructure subnet created in the durable private VNet."
  default     = null
}

# tflint-ignore: terraform_standard_module_structure
variable "testing_private_agents_subnet_cidr" {
  type        = string
  description = "Test-only CIDR for the ephemeral Azure AI Foundry agents subnet used by the capability-host profile."
  default     = null
}

# tflint-ignore: terraform_standard_module_structure
variable "testing_private_jumpbox_subnet_cidr" {
  type        = string
  description = "Test-only CIDR for the ephemeral jumpbox subnet created in the durable private VNet."
  default     = null
}

# tflint-ignore: terraform_standard_module_structure
variable "testing_jumpbox_allowed_cidr" {
  type        = string
  description = "Test-only SSH CIDR allowlist for the ephemeral jumpbox."
  default     = null
}

# tflint-ignore: terraform_standard_module_structure
variable "testing_jumpbox_admin_username" {
  type        = string
  description = "Admin username for the ephemeral test jumpbox."
  default     = "azureuser"
}

# tflint-ignore: terraform_standard_module_structure
variable "testing_jumpbox_vm_size" {
  type        = string
  description = "VM size for the ephemeral test jumpbox."
  default     = "Standard_B2s"
}

# tflint-ignore: terraform_standard_module_structure
variable "testing_jumpbox_ssh_public_key" {
  type        = string
  description = "SSH public key for the ephemeral test jumpbox. Leave null to skip provisioning the jumpbox."
  default     = null
}

# tflint-ignore: terraform_standard_module_structure
variable "testing_capability_host_resource_group_name" {
  type        = string
  description = "Test-only resource group that contains the durable capability-host resources."
  default     = null
}

# tflint-ignore: terraform_standard_module_structure
variable "testing_capability_host_cosmosdb_account_name" {
  type        = string
  description = "Test-only Cosmos DB account name for the durable capability-host resources."
  default     = null
}

# tflint-ignore: terraform_standard_module_structure
variable "testing_capability_host_storage_account_name" {
  type        = string
  description = "Test-only Storage account name for the durable capability-host resources."
  default     = null
}

# tflint-ignore: terraform_standard_module_structure
variable "testing_capability_host_search_service_name" {
  type        = string
  description = "Test-only Azure AI Search service name for the durable capability-host resources."
  default     = null
}

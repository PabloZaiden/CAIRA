# Terraform root modules only load .tf files from the current directory, so the
# test-only resources stay here while their auxiliary assets live under
# testing_overlay/.
locals {
  testing_private_enabled                           = contains(["private", "private-capability-host"], var.testing_profile)
  testing_capability_host_enabled                   = var.testing_profile == "private-capability-host"
  testing_jumpbox_enabled                           = local.testing_private_enabled && var.testing_jumpbox_ssh_public_key != null
  testing_suffix                                    = substr(sha1("${local.base_name}-${var.testing_profile}"), 0, 8)
  testing_container_apps_subnet                     = substr("aca-${local.base_name}-${local.testing_suffix}", 0, 80)
  testing_agents_subnet                             = substr("agents-${local.base_name}-${local.testing_suffix}", 0, 80)
  testing_jumpbox_subnet                            = substr("jumpbox-${local.base_name}-${local.testing_suffix}", 0, 80)
  testing_jumpbox_name                              = substr("jumpbox-${local.base_name}-${local.testing_suffix}", 0, 63)
  effective_foundry_subnet_id                       = local.testing_private_enabled ? data.azurerm_subnet.testing_private_connection[0].id : null
  effective_container_apps_infrastructure_subnet_id = local.testing_private_enabled ? azurerm_subnet.testing_container_apps[0].id : null
  effective_agents_subnet_id                        = local.testing_capability_host_enabled ? azurerm_subnet.testing_agents[0].id : null
  effective_agent_capability_host_connections       = local.testing_capability_host_enabled ? module.testing_capability_host_connections[0].connections : null
  effective_frontend_external_enabled               = true
  effective_frontend_allowed_cidrs                  = local.testing_private_enabled ? [] : [var.allowed_cidr]
}

check "testing_private_profile_inputs" {
  assert {
    condition = !local.testing_private_enabled || (
      var.testing_private_pool_resource_group_name != null &&
      var.testing_private_pool_vnet_name != null &&
      var.testing_private_container_apps_subnet_cidr != null
    )
    error_message = "Private test profiles require testing_private_pool_resource_group_name, testing_private_pool_vnet_name, and testing_private_container_apps_subnet_cidr."
  }
}

check "testing_jumpbox_inputs" {
  assert {
    condition = (
      (var.testing_jumpbox_ssh_public_key == null && var.testing_jumpbox_allowed_cidr == null && var.testing_private_jumpbox_subnet_cidr == null) ||
      (var.testing_jumpbox_ssh_public_key != null && var.testing_jumpbox_allowed_cidr != null && var.testing_private_jumpbox_subnet_cidr != null)
    )
    error_message = "Jumpbox testing requires testing_jumpbox_ssh_public_key, testing_jumpbox_allowed_cidr, and testing_private_jumpbox_subnet_cidr together."
  }
}

check "testing_capability_host_inputs" {
  assert {
    condition = !local.testing_capability_host_enabled || (
      var.testing_private_agents_subnet_cidr != null &&
      var.testing_capability_host_resource_group_name != null &&
      var.testing_capability_host_cosmosdb_account_name != null &&
      var.testing_capability_host_storage_account_name != null &&
      var.testing_capability_host_search_service_name != null
    )
    error_message = "The private-capability-host profile requires the capability-host resource names and testing_private_agents_subnet_cidr."
  }
}

data "azurerm_client_config" "current" {}

data "azurerm_subnet" "testing_private_connection" {
  count = local.testing_private_enabled ? 1 : 0

  name                 = var.testing_private_connection_subnet_name
  virtual_network_name = var.testing_private_pool_vnet_name
  resource_group_name  = var.testing_private_pool_resource_group_name
}

data "azurerm_virtual_network" "testing_private_pool" {
  count = local.testing_private_enabled ? 1 : 0

  name                = var.testing_private_pool_vnet_name
  resource_group_name = var.testing_private_pool_resource_group_name
}

resource "azurerm_subnet" "testing_container_apps" {
  count = local.testing_private_enabled ? 1 : 0

  name                 = local.testing_container_apps_subnet
  resource_group_name  = var.testing_private_pool_resource_group_name
  virtual_network_name = var.testing_private_pool_vnet_name
  address_prefixes     = [var.testing_private_container_apps_subnet_cidr]

  delegation {
    name = "container-apps-environments"

    service_delegation {
      name = "Microsoft.App/environments"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/action"
      ]
    }
  }
}

resource "azurerm_subnet" "testing_agents" {
  count = local.testing_capability_host_enabled ? 1 : 0

  name                 = local.testing_agents_subnet
  resource_group_name  = var.testing_private_pool_resource_group_name
  virtual_network_name = var.testing_private_pool_vnet_name
  address_prefixes     = [var.testing_private_agents_subnet_cidr]

  delegation {
    name = "foundry-agents"

    service_delegation {
      name = "Microsoft.App/environments"
      actions = [
        "Microsoft.Network/virtualNetworks/subnets/action"
      ]
    }
  }
}

module "testing_capability_host_connections" {
  count = local.testing_capability_host_enabled ? 1 : 0

  source = "../../modules/existing_resources_agent_capability_host_connections"

  resource_group_resource_id = "/subscriptions/${data.azurerm_client_config.current.subscription_id}/resourceGroups/${var.testing_capability_host_resource_group_name}"
  cosmosdb_account_name      = var.testing_capability_host_cosmosdb_account_name
  storage_account_name       = var.testing_capability_host_storage_account_name
  search_service_name        = var.testing_capability_host_search_service_name
  location                   = var.location
}

resource "azurerm_subnet" "testing_jumpbox" {
  count = local.testing_jumpbox_enabled ? 1 : 0

  name                 = local.testing_jumpbox_subnet
  resource_group_name  = var.testing_private_pool_resource_group_name
  virtual_network_name = var.testing_private_pool_vnet_name
  address_prefixes     = [var.testing_private_jumpbox_subnet_cidr]
}

resource "azurerm_private_dns_zone" "testing_container_apps" {
  count = local.testing_private_enabled ? 1 : 0

  name                = module.container_apps_environment.default_domain
  resource_group_name = local.resource_group_name
  tags                = var.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "testing_container_apps" {
  count = local.testing_private_enabled ? 1 : 0

  name                  = substr("${local.app_prefix}-dns-link", 0, 80)
  resource_group_name   = local.resource_group_name
  private_dns_zone_name = azurerm_private_dns_zone.testing_container_apps[0].name
  virtual_network_id    = data.azurerm_virtual_network.testing_private_pool[0].id
  registration_enabled  = false
  tags                  = var.tags
}

resource "azurerm_private_dns_a_record" "testing_container_apps" {
  for_each = local.testing_private_enabled ? toset(["*", "*.internal"]) : toset([])

  name                = each.value
  zone_name           = azurerm_private_dns_zone.testing_container_apps[0].name
  resource_group_name = local.resource_group_name
  ttl                 = 30
  records             = [module.container_apps_environment.static_ip_address]
}

resource "azurerm_public_ip" "testing_jumpbox" {
  count = local.testing_jumpbox_enabled ? 1 : 0

  name                = "${local.testing_jumpbox_name}-pip"
  location            = var.location
  resource_group_name = local.resource_group_name
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = var.tags
}

resource "azurerm_network_security_group" "testing_jumpbox" {
  count = local.testing_jumpbox_enabled ? 1 : 0

  name                = "${local.testing_jumpbox_name}-nsg"
  location            = var.location
  resource_group_name = local.resource_group_name
  tags                = var.tags

  security_rule {
    name                       = "allow-ssh-from-test-runner"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = var.testing_jumpbox_allowed_cidr
    destination_address_prefix = "*"
  }
}

resource "azurerm_network_interface" "testing_jumpbox" {
  count = local.testing_jumpbox_enabled ? 1 : 0

  name                = "${local.testing_jumpbox_name}-nic"
  location            = var.location
  resource_group_name = local.resource_group_name
  tags                = var.tags

  ip_configuration {
    name                          = "primary"
    subnet_id                     = azurerm_subnet.testing_jumpbox[0].id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.testing_jumpbox[0].id
  }
}

resource "azurerm_network_interface_security_group_association" "testing_jumpbox" {
  count = local.testing_jumpbox_enabled ? 1 : 0

  network_interface_id      = azurerm_network_interface.testing_jumpbox[0].id
  network_security_group_id = azurerm_network_security_group.testing_jumpbox[0].id
}

resource "azurerm_linux_virtual_machine" "testing_jumpbox" {
  count = local.testing_jumpbox_enabled ? 1 : 0

  name                            = local.testing_jumpbox_name
  resource_group_name             = local.resource_group_name
  location                        = var.location
  size                            = var.testing_jumpbox_vm_size
  admin_username                  = var.testing_jumpbox_admin_username
  disable_password_authentication = true
  network_interface_ids           = [azurerm_network_interface.testing_jumpbox[0].id]
  custom_data                     = base64encode(templatefile("${path.module}/testing_overlay/testing_jumpbox.cloud-init.yaml.tftpl", {}))
  tags                            = var.tags

  admin_ssh_key {
    username   = var.testing_jumpbox_admin_username
    public_key = var.testing_jumpbox_ssh_public_key
  }

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts-gen2"
    version   = "latest"
  }

  depends_on = [azurerm_network_interface_security_group_association.testing_jumpbox]
}

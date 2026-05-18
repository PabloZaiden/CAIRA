# Container Registry Module

Small Azure Container Registry layer for CAIRA application deployments.

<!-- BEGIN_TF_DOCS -->

## Requirements

| Name | Version |

|------|---------|

| terraform | >= 1.13, < 2.0 |

| azurerm | ~> 4.40 |

## Providers

| Name | Version |

|------|---------|

| azurerm | ~> 4.40 |

## Resources

| Name | Type |

|------|------|

| [azurerm_container_registry.this](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/container_registry) | resource |

## Inputs

| Name | Description | Type | Default | Required |

|------|-------------|------|---------|:--------:|

| location | Azure location for the Azure Container Registry. | `string` | n/a | yes |

| name | Name of the Azure Container Registry. | `string` | n/a | yes |

| resource\_group\_name | Resource group that hosts the Azure Container Registry. | `string` | n/a | yes |

| admin\_enabled | When true, enables the admin user on the Azure Container Registry. | `bool` | `false` | no |

| sku | SKU for the Azure Container Registry. | `string` | `"Basic"` | no |

| tags | Optional tags applied to the Azure Container Registry. | `map(string)` | `{}` | no |

## Outputs

| Name | Description |

|------|-------------|

| id | Resource ID of the Azure Container Registry. |

| login\_server | Login server of the Azure Container Registry. |

| name | Name of the Azure Container Registry. |

<!-- END_TF_DOCS -->

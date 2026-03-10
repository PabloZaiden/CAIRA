# Container Apps Environment Module

Small Azure Container Apps environment layer for CAIRA application deployments.

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

| [azurerm_container_app_environment.this](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/container_app_environment) | resource |

## Inputs

| Name | Description | Type | Default | Required |

|------|-------------|------|---------|:--------:|

| location | Azure location for the Container Apps environment. | `string` | n/a | yes |

| log\_analytics\_workspace\_id | Log Analytics workspace ID used by the Container Apps environment. | `string` | n/a | yes |

| name | Name of the Azure Container Apps environment. | `string` | n/a | yes |

| resource\_group\_name | Resource group that hosts the Container Apps environment. | `string` | n/a | yes |

| infrastructure\_subnet\_id | Optional subnet ID for a private Container Apps environment. | `string` | `null` | no |

| tags | Optional tags applied to the Container Apps environment. | `map(string)` | `{}` | no |

## Outputs

| Name | Description |

|------|-------------|

| default\_domain | Default DNS domain assigned to the Container Apps environment. |

| id | Resource ID of the Container Apps environment. |

| name | Name of the Container Apps environment. |

| static\_ip\_address | Static IP address assigned to the Container Apps environment. |

<!-- END_TF_DOCS -->

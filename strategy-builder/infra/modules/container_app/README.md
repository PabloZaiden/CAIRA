# Container App Module

Reusable Azure Container App layer for CAIRA application services.

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

| [azurerm_container_app.this](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/container_app) | resource |

## Inputs

| Name | Description | Type | Default | Required |

|------|-------------|------|---------|:--------:|

| container\_app\_environment\_id | Container Apps environment ID used by the Container App. | `string` | n/a | yes |

| image | Container image for the Container App. | `string` | n/a | yes |

| name | Name of the Azure Container App. | `string` | n/a | yes |

| resource\_group\_name | Resource group that hosts the Container App. | `string` | n/a | yes |

| target\_port | Port exposed by the application container. | `number` | n/a | yes |

| allow\_insecure\_connections | When true, allows insecure ingress connections. | `bool` | `false` | no |

| allowed\_cidrs | Optional CIDR allowlist applied to public ingress. | `list(string)` | `[]` | no |

| container\_name | Optional container name inside the Container App. Defaults to the app name. | `string` | `null` | no |

| cpu | CPU allocation for the app container. | `number` | `0.5` | no |

| enable\_registry\_auth | When true, uses the app managed identity for Azure Container Registry auth. | `bool` | `false` | no |

| environment\_variables | Environment variables injected into the app container. | `map(string)` | `{}` | no |

| external\_enabled | When true, exposes ingress publicly. | `bool` | `false` | no |

| ingress\_enabled | When true, creates ingress for the Container App. | `bool` | `true` | no |

| max\_replicas | Maximum number of replicas. | `number` | `1` | no |

| memory | Memory allocation for the app container. | `string` | `"1Gi"` | no |

| min\_replicas | Minimum number of replicas. | `number` | `1` | no |

| registry\_server | Container Registry login server used when enable\_registry\_auth is true. | `string` | `null` | no |

| tags | Optional tags applied to the Container App. | `map(string)` | `{}` | no |

| transport | Ingress transport mode. | `string` | `"auto"` | no |

## Outputs

| Name | Description |

|------|-------------|

| fqdn | Ingress FQDN of the Container App, or null when ingress is disabled. |

| id | Resource ID of the Container App. |

| name | Name of the Container App. |

| principal\_id | Principal ID of the Container App system-assigned managed identity. |

| url | HTTPS URL of the Container App ingress, or null when ingress is disabled. |

<!-- END_TF_DOCS -->

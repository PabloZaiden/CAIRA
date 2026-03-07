# Foundry Agent + API + Frontend Foundation Reference Architecture

This directory contains the canonical CAIRA foundation reference architecture.

## What it models

- Azure AI Foundry account and project(s)
- baseline model deployments
- optional public or private networking
- optional capability-host resources for agent workloads
- observability resources for the shared platform foundation

## Main configuration axes

The architecture exposes three primary decision points:

| Setting                | Values                    | Purpose                                                           |
|------------------------|---------------------------|-------------------------------------------------------------------|
| `deployment_profile`   | `basic`, `standard`       | Controls whether capability-host resources are part of the design |
| `network_mode`         | `public`, `private`       | Chooses the connectivity model                                    |
| `capability_host_mode` | `none`, `new`, `existing` | Chooses how agent support services are supplied                   |

## Quick start

```bash
cd infra/architectures/foundry-agent-api-frontend
terraform init
terraform plan
terraform apply
```

## Relationship to deployment strategies

The generated deployment strategies under `deployment-strategies/` build on this shared foundation. Nightly validation reuses durable supporting infrastructure where appropriate and deploys or destroys the app-layer strategy resources independently.

<!-- BEGIN_TF_DOCS -->

## Requirements

| Name | Version |

|------|---------|

| terraform | >= 1.13, < 2.0 |

| azapi | ~> 2.6 |

| azurerm | ~> 4.40 |

| time | ~> 0.13 |

## Providers

| Name | Version |

|------|---------|

| azurerm | ~> 4.40 |

## Modules

| Name | Source | Version |

|------|--------|---------|

| ai\_foundry | ../../modules/ai_foundry | n/a |

| application\_insights | Azure/avm-res-insights-component/azurerm | 0.2.0 |

| capability\_host\_resources\_1 | ../../modules/new_resources_agent_capability_host_connections | n/a |

| capability\_host\_resources\_2 | ../../modules/new_resources_agent_capability_host_connections | n/a |

| capability\_host\_resources\_existing | ../../modules/existing_resources_agent_capability_host_connections | n/a |

| common\_models | ../../modules/common_models | n/a |

| default\_project | ../../modules/ai_foundry_project | n/a |

| naming | Azure/naming/azurerm | 0.4.3 |

| secondary\_project | ../../modules/ai_foundry_project | n/a |

## Resources

| Name | Type |

|------|------|

| [azurerm_log_analytics_workspace.this](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/log_analytics_workspace) | resource |

| [azurerm_resource_group.this](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/resource_group) | resource |

## Inputs

| Name | Description | Type | Default | Required |

|------|-------------|------|---------|:--------:|

| agents\_subnet\_id | Subnet ID for agent capability host injection (required for private + standard when capability\_host\_mode is not 'none'). | `string` | `null` | no |

| base\_name | Base name used as suffix in the naming module. | `string` | `"foundry-agent-api-frontend"` | no |

| capability\_host\_mode | How to provide capability host resources for standard profile: 'new', 'existing', or 'none'. | `string` | `"new"` | no |

| deployment\_profile | Conceptual profile: 'basic' (Foundry only) or 'standard' (Foundry + agent capability host connections). | `string` | `"standard"` | no |

| enable\_secondary\_project | When true and deployment\_profile='standard', creates a secondary Foundry project. | `bool` | `false` | no |

| enable\_telemetry | Controls whether AVM telemetry and partner attribution are enabled.<br/>If false, telemetry is disabled. | `bool` | `true` | no |

| existing\_capability\_host\_resource\_group\_id | Resource group ID containing existing Cosmos DB, Storage, and AI Search resources. | `string` | `null` | no |

| existing\_cosmosdb\_account\_name | Existing Cosmos DB account name used for capability host connections. | `string` | `null` | no |

| existing\_search\_service\_name | Existing AI Search service name used for capability host connections. | `string` | `null` | no |

| existing\_storage\_account\_name | Existing Storage account name used for capability host connections. | `string` | `null` | no |

| foundry\_subnet\_id | Subnet ID used for AI Foundry private endpoint injection (required for private mode). | `string` | `null` | no |

| location | Azure region where resources should be deployed. | `string` | `"swedencentral"` | no |

| monitor\_private\_link\_scope\_resource\_id | Optional Azure Monitor Private Link Scope resource ID used for private monitoring integration. | `string` | `null` | no |

| network\_mode | Connectivity posture: 'public' or 'private'. | `string` | `"public"` | no |

| resource\_group\_resource\_id | Resource group ID where resources will be deployed. If null, a new resource group is created. | `string` | `null` | no |

| sku | SKU for the AI Foundry account. | `string` | `"S0"` | no |

| tags | Optional tags applied to all resources. | `map(string)` | `null` | no |

## Outputs

| Name | Description |

|------|-------------|

| agent\_capability\_host\_connections\_default | Capability host connections used by the default project (null when capability hosts are disabled). |

| agent\_capability\_host\_connections\_secondary | Capability host connections used by the secondary project (null when disabled). |

| ai\_foundry\_default\_project\_id | The resource ID of the default AI Foundry project. |

| ai\_foundry\_default\_project\_identity\_principal\_id | The principal ID of the default project system-assigned managed identity. |

| ai\_foundry\_default\_project\_name | The name of the default AI Foundry project. |

| ai\_foundry\_endpoint | The endpoint URL of the AI Foundry account. |

| ai\_foundry\_id | The resource ID of the AI Foundry account. |

| ai\_foundry\_model\_deployments\_ids | The IDs of the AI Foundry model deployments. |

| ai\_foundry\_name | The name of the AI Foundry account. |

| ai\_foundry\_secondary\_project\_id | The resource ID of the secondary AI Foundry project (null when disabled). |

| ai\_foundry\_secondary\_project\_identity\_principal\_id | The principal ID of the secondary project managed identity (null when disabled). |

| ai\_foundry\_secondary\_project\_name | The name of the secondary AI Foundry project (null when disabled). |

| application\_insights\_id | The resource ID of the Application Insights instance. |

| effective\_capability\_host\_mode | Resolved capability host mode after profile normalization. |

| effective\_deployment\_profile | Resolved deployment profile. |

| effective\_network\_mode | Resolved network mode. |

| log\_analytics\_workspace\_id | The resource ID of the Log Analytics workspace. |

| resource\_group\_id | The resource ID of the resource group. |

| resource\_group\_name | The name of the resource group. |

<!-- END_TF_DOCS -->

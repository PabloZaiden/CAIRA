# Durable Infrastructure Data Module

This module provides **read-only lookups** of pre-created infrastructure from Pool 2 (foundry_standard_private test infrastructure).

## Purpose

Instead of creating infrastructure on every test run (slow, 8-12 minutes), this module uses **data sources** to look up existing resources (fast, 10-20 seconds).

## What Gets Looked Up

All durable infrastructure from Pool 2:

- ✅ Resource Group
- ✅ Virtual Network (172.16.0.0/16)
- ✅ Connections Subnet (172.16.0.0/24)
- ✅ Private DNS Zones (3 zones)
- ✅ Cosmos DB Account (serverless)
- ✅ Storage Account
- ✅ AI Search Service

**Not included:** Agent subnet (created by `setup_ephemeral` module)

## Usage in Tests

```hcl
# tests/integration/test.tftest.hcl

run "data" {
  command = plan # Fast data source lookups only

  module {
    source = "./data"
  }

  variables {
    resource_group_name    = var.fsp_resource_group_name
    vnet_name              = var.fsp_vnet_name
    connection_subnet_name = var.fsp_connection_subnet_name
    cosmosdb_account_name  = var.fsp_cosmosdb_account_name
    storage_account_name   = var.fsp_storage_account_name
    search_service_name    = var.fsp_search_service_name
  }
}

# Later tests reference: run.data.connection.id, run.data.cosmosdb_account_name, etc.
```

## Inputs

| Name                      | Description             | Type     | Default                                     | Required |
|---------------------------|-------------------------|----------|---------------------------------------------|----------|
| fsp_resource_group_name   | Resource group name     | `string` | n/a                                         | yes      |
| fsp_vnet_name             | VNet name               | `string` | n/a                                         | yes      |
| connection_subnet_name    | Connections subnet name | `string` | `"connections"`                             | no       |
| cognitive_dns_zone_name   | Cognitive DNS zone      | `string` | `"privatelink.cognitiveservices.azure.com"` | no       |
| ai_services_dns_zone_name | AI Services DNS zone    | `string` | `"privatelink.services.ai.azure.com"`       | no       |
| openai_dns_zone_name      | OpenAI DNS zone         | `string` | `"privatelink.openai.azure.com"`            | no       |
| fsp_cosmosdb_account_name | Cosmos DB account name  | `string` | n/a                                         | yes      |
| fsp_storage_account_name  | Storage account name    | `string` | n/a                                         | yes      |
| fsp_search_service_name   | AI Search service name  | `string` | n/a                                         | yes      |

## Outputs

See `outputs.tf` for full list. Key outputs:

- `connection` - Connections subnet resource
- `resource_group_id` - Resource group ID
- `cosmosdb_account_name`, `cosmosdb_endpoint`, `cosmosdb_resource_id`
- `storage_account_name`, `storage_primary_blob_endpoint`, `storage_resource_id`
- `search_service_name`, `search_resource_id`
- `private_dns_zones` - Map of DNS zone names

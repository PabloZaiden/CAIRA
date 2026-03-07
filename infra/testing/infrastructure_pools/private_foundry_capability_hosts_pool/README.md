# Infrastructure Pool: Private Foundry with Capability Hosts

## Overview

This module creates a durable infrastructure pool for private Foundry validation that also needs capability hosts. It provides shared networking, DNS, and capability-host resources that persist across multiple test runs.

## Purpose

Instead of creating and destroying infrastructure for each test run, this pool:

- **Saves time**: Eliminates 8-12 minutes of setup per test run
- **Reduces costs**: Avoids repeated deployment/teardown cycles
- **Ensures consistency**: Same infrastructure across all test runs

## Resources Created

### Networking

- **Resource Group**: `rg-prvfdrycap-durable`
- **Virtual Network**: `vnet-prvfdrycap-durable` (172.16.0.0/16)
- **Connection Subnet**: `connections` (172.16.0.0/24) - for private endpoints

### DNS

- **Cognitive Services DNS Zone**: `privatelink.cognitiveservices.azure.com`
- **AI Services DNS Zone**: `privatelink.services.ai.azure.com`
- **OpenAI DNS Zone**: `privatelink.openai.azure.com`

All zones are linked to the VNet for private name resolution.

### Capability Hosts

- **Cosmos DB**: `cosmos-prvfdrycap-durable` (serverless, Session consistency)
- **Storage Account**: `stprvfdrycapdurable` (Standard LRS, shared key disabled)
- **AI Search**: `srch-prvfdrycap-durable` (Basic tier)

## Usage

### Initial Deployment

```bash
cd infra/testing/infrastructure_pools/private_foundry_capability_hosts_pool
terraform init
terraform apply
```

### Get Resource Names for Tests

```bash
terraform output -json
```

Use these outputs to configure test environment variables.

### Teardown (Only When Needed)

```bash
terraform destroy
```

**Note**: This infrastructure is designed to persist. Only destroy when:

- Changing region or network configuration
- Cleaning up after testing is complete
- Cost optimization during inactive periods

## Predictable Naming

This module uses **static naming** with the `durable` suffix instead of random suffixes. This means:

- Resource names are consistent across deployments
- No need to update GitHub variables after teardown/redeploy
- Easy to reference in scripts and documentation

Example names:

- `rg-prvfdrycap-durable`
- `vnet-prvfdrycap-durable`
- `cosmos-prvfdrycap-durable`
- `stprvfdrycapdurable`
- `srch-prvfdrycap-durable`

## Integration with Tests

Tests reference this infrastructure through CAIRA's private capability-host validation inputs.

Environment variables:

```bash
export TF_VAR_resource_group_name="rg-prvfdrycap-durable"
export TF_VAR_vnet_name="vnet-prvfdrycap-durable"
export TF_VAR_cosmosdb_account_name="cosmos-prvfdrycap-durable"
export TF_VAR_storage_account_name="stprvfdrycapdurable"
export TF_VAR_search_service_name="srch-prvfdrycap-durable"
```

## Variables

| Name        | Type   | Default         | Description                   |
|-------------|--------|-----------------|-------------------------------|
| `location`  | string | `swedencentral` | Azure region for deployment   |
| `base_name` | string | `prvfdrycap`    | Base name for resource naming |

## Outputs

| Name                    | Description              |
|-------------------------|--------------------------|
| `connection`            | Connection subnet object |
| `resource_group_name`   | Resource group name      |
| `resource_group_id`     | Resource group ID        |
| `virtual_network_id`    | Virtual network ID       |
| `private_dns_zones`     | Map of DNS zone names    |
| `cosmosdb_account_name` | Cosmos DB account name   |
| `storage_account_name`  | Storage account name     |
| `search_service_name`   | AI Search service name   |

## Maintenance

### Health Check

```bash
cd infra/testing/infrastructure_pools/private_foundry_capability_hosts_pool
terraform plan  # Should show no changes if healthy
```

### Update Infrastructure

```bash
# Make changes to configuration
terraform plan   # Review changes
terraform apply  # Apply updates
```

### Move to a Different Region

```bash
# 1. Update location variable
# 2. Destroy old infrastructure
terraform destroy

# 3. Deploy to new region
terraform apply

# 4. Update test environment variables with new resource names
```

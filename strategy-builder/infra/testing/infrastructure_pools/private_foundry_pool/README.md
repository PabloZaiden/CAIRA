# Infrastructure Pool: Private Foundry

## Overview

This module creates a durable infrastructure pool for private Foundry validation. It provides shared networking and DNS resources that persist across multiple test runs.

## Purpose

Instead of creating and destroying infrastructure for each test run, this pool:

- **Saves time**: Eliminates setup time per test run
- **Reduces costs**: Avoids repeated deployment/teardown cycles
- **Ensures consistency**: Same infrastructure across all test runs

## Resources Created

### Networking

- **Resource Group**: `rg-prvfdry-durable`
- **Virtual Network**: `vnet-prvfdry-durable` (172.16.0.0/16)
- **Connection Subnet**: `connections` (172.16.0.0/24) - for private endpoints

### DNS

- **Cognitive Services DNS Zone**: `privatelink.cognitiveservices.azure.com`
- **AI Services DNS Zone**: `privatelink.services.ai.azure.com`
- **OpenAI DNS Zone**: `privatelink.openai.azure.com`

All zones are linked to the VNet for private name resolution.

## Usage

### Initial Deployment

```bash
cd strategy-builder/infra/testing/infrastructure_pools/private_foundry_pool
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

- `rg-prvfdry-durable`
- `vnet-prvfdry-durable`

## Integration with Tests

Tests reference this infrastructure using data sources in acceptance and integration tests.

## Variables

| Name        | Type   | Default         | Description                   |
|-------------|--------|-----------------|-------------------------------|
| `location`  | string | `swedencentral` | Azure region for deployment   |
| `base_name` | string | `prvfdry`       | Base name for resource naming |

## Outputs

| Name                  | Description              |
|-----------------------|--------------------------|
| `connection`          | Connection subnet object |
| `resource_group_name` | Resource group name      |
| `virtual_network_id`  | Virtual network ID       |
| `private_dns_zones`   | Map of DNS zone names    |

## Maintenance

### Health Check

```bash
cd strategy-builder/infra/testing/infrastructure_pools/private_foundry_pool
terraform plan  # Should show no changes if healthy
```

### Update Infrastructure

```bash
# Make changes to configuration
terraform plan   # Review changes
terraform apply  # Apply updates
```

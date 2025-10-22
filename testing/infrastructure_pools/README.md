# Testing Infrastructure Pools

## Overview

This directory contains Terraform modules for creating **durable infrastructure pools** that support testing of CAIRA reference architectures. These pools provide shared, persistent resources that remain deployed across multiple test runs, significantly reducing test execution time and Azure costs.

## Purpose

Infrastructure pools solve a critical testing challenge: many Azure resources (particularly networking components, DNS zones, and capability host resources) take considerable time to provision and destroy. By maintaining these resources in a persistent state, we achieve:

- **Faster Test Execution**: Eliminates 8-15 minutes of setup/teardown per test run
- **Test Consistency**: Ensures all tests use identical base infrastructure
- **Resource Name Stability**: Prevents naming conflicts from rapid resource recreation

## Available Pools

### Foundry Basic Private Pool

Provides networking and DNS infrastructure for testing the `foundry_basic_private` reference architecture.

- **Directory**: `foundry_basic_private/`
- **Resource Group**: `rg-fbscprv-durable`
- **Primary Resources**:
  - Virtual Network with private endpoint subnet
  - Private DNS zones for Cognitive Services, AI Services, and OpenAI

[View detailed documentation →](./foundry_basic_private/README.md)

### Foundry Standard Private Pool

Provides comprehensive infrastructure for testing the `foundry_standard_private` reference architecture, including capability host resources.

- **Directory**: `foundry_standard_private/`
- **Resource Group**: `rg-fstdprv-durable`
- **Primary Resources**:
  - Virtual Network with private endpoint subnet
  - Private DNS zones for multiple Azure services
  - Cosmos DB account (capability host)
  - AI Search service (capability host)
  - Storage account (capability host)

[View detailed documentation →](./foundry_standard_private/README.md)

## Infrastructure Refresh Process

A GitHub Actions workflow (`.github/workflows/refresh_durable_infrastructure.yml`) automatically refreshes these pools:

### Automatic Refresh

- **Schedule**: Every Sunday at 3:00 AM UTC
- **Purpose**: Ensures infrastructure remains clean and resources are periodically refreshed
- **Process**:
  1. Destroys existing infrastructure pools
  1. Waits for complete resource deletion
  1. Deploys fresh infrastructure with the same static names
  1. Updates repository variables if resource names change (currently, names are reused)

### Manual Refresh

You can manually trigger the refresh workflow:

```bash
# Via GitHub UI: Actions → Refresh Durable Infrastructure Pools → Run workflow

# Or via GitHub CLI:
gh workflow run refresh_durable_infrastructure.yml
```

**Options**:

- `skip_destroy`: Set to `true` to only create/update infrastructure without destroying first

## Usage in Tests

### Terraform Test Files

Reference these pools in your `*.tftest.hcl` files:

```hcl
# Example: Using the Foundry Basic Private pool
run "setup" {
  module {
    source = "../../../testing/infrastructure_pools/foundry_basic_private"
  }
}

run "deploy_architecture" {
  variables {
    foundry_subnet_id = run.setup.foundry_subnet_id
    # Use other outputs from the pool...
  }
}
```

### GitHub Repository Variables

The refresh workflow maintains these variables for CI/CD:

- `TF_VAR_FSP_STORAGE_ACCOUNT_NAME`: Storage account name for Foundry Standard Private pool

## Local Development

### Prerequisites

- Azure CLI authenticated
- Terraform >= 1.9.0
- Appropriate Azure subscription permissions

### Deploy a Pool Locally

```bash
# Navigate to the pool directory
cd testing/infrastructure_pools/foundry_basic_private

# Initialize Terraform
terraform init

# Plan deployment
terraform plan -out=tfplan

# Apply deployment
terraform apply tfplan
```

### Destroy a Pool Locally

```bash
cd testing/infrastructure_pools/foundry_basic_private
terraform destroy
```

## Best Practices

### When to Use Infrastructure Pools

✅ **Use pools for**:

- Network infrastructure (VNets, subnets, NSGs)
- Private DNS zones
- Capability host resources (Cosmos DB, AI Search, Storage)
- Any resources with long provisioning times

❌ **Don't use pools for**:

- AI Foundry hubs and projects (test-specific)
- Model deployments (test-specific)
- Role assignments to test-specific resources
- Resources that should be isolated per test

### Naming Conventions

Infrastructure pools use consistent naming:

- Resource groups: `rg-{arch}-durable`
- Virtual networks: `vnet-{arch}-durable`
- Subnets: Descriptive names like `connections` (note: `agents` subnets are created ephemerally outside the pool)

Where `{arch}` is an abbreviation:

- `fbscprv` = Foundry Basic Private
- `fstdprv` = Foundry Standard Private

## Troubleshooting

### Pool Resources Not Found

If tests fail because pool resources don't exist:

1. Check if the pool has been deployed:

   ```bash
   az group show --name rg-fbscprv-durable
   ```

1. Deploy the pool manually if needed (see Local Development section)
1. Check the last run of the refresh workflow for errors

### Stale Resource Names

If repository variables point to deleted resources:

1. Manually trigger the refresh workflow
1. Or update variables manually in repository settings

### Permission Errors

Ensure your Azure credentials have:

- `Contributor` or `Owner` on the subscription
- Permissions to create resource groups and resources
- Access to manage private DNS zones

## Related Documentation

- [Development Workflow](../../docs/contributing/development_workflow.md)
- [Terraform Testing Guide](../../docs/contributing/development_workflow.md#testing)
- [Reference Architectures](../../reference_architectures/README.md)

<!-- BEGIN_TF_DOCS -->

<!-- END_TF_DOCS -->

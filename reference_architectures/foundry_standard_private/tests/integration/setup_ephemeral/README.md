# Ephemeral Agent Subnet Setup

This module creates **only the agent subnet** for `foundry_standard_private` integration tests. The subnet is created with a dynamically allocated CIDR based on the test run ID and destroyed after test completion.

## Why Ephemeral?

Agent subnets **cannot be reused** across Container App Environments due to exclusive delegation requirements:

1. **Service Association Links**: When a Container App Environment is created, it establishes exclusive service association links to the subnet
1. **No Concurrent Use**: While these links exist, no other Container App Environment can use that subnet
1. **Cleanup Delay**: Even after Container App Environment deletion, there's a cleanup period for service association links
1. **Parallel Testing**: Dynamic CIDR allocation enables multiple tests to run in parallel without conflicts

## CIDR Allocation Strategy

**VNet Address Space:** 172.16.0.0/16 (from durable infrastructure)

**Allocation Plan:**

```text
172.16.0.0/24   → Connections subnet (DURABLE)
172.16.1.0/24   → Reserved for future use
172.16.2.0/24   → Agent subnet slot #1 (ephemeral)
172.16.3.0/24   → Agent subnet slot #2 (ephemeral)
...
172.16.255.0/24 → Agent subnet slot #254 (ephemeral)
```

**Algorithm:**

1. Convert test run ID to number (e.g., GitHub Actions run ID: `12345678` or timestamp: `20250421143022`)
1. Modulo by 254 to get slot number (0-253)
1. Add 2 to get octet value (range: 2-255)
1. Generate CIDR: `172.16.{octet}.0/24`

**Example:**

- Run ID: `20250421143022` (timestamp from `formatdate("YYYYMMDDHHmmss", timestamp())`)
- Calculation: `(20250421143022 % 254) + 2` → `168`
- CIDR: `172.16.168.0/24`
- Subnet name: `agent-20250421143022`

## Usage in Tests

### Integration Test Structure

```hcl
# tests/integration/test.tftest.hcl

# Run 1: Lookup durable infrastructure
run "data" {
  command = plan
  module {
    source = "./data"
  }
  variables {
    resource_group_name = var.fsp_resource_group_name
    vnet_name           = var.fsp_vnet_name
    # ... other durable resources
  }
}

# Run 2: Create ephemeral agent subnet
run "setup_ephemeral" {
  command = apply
  module {
    source = "./setup_ephemeral"
  }
  variables {
    test_run_id         = var.test_run_id # From CI/CD
    vnet_name           = var.fsp_vnet_name
    vnet_resource_group = var.fsp_resource_group_name
  }
}

# Run 3+: Integration tests
run "testint_basic_deployment" {
  command = apply
  variables {
    agents_subnet_id  = run.setup_ephemeral.agent_subnet_id # Ephemeral
    foundry_subnet_id = run.data.connection.id              # Durable
    # ... other variables
  }
}
```

## Inputs

| Name                      | Description                          | Type     | Default | Required |
|---------------------------|--------------------------------------|----------|---------|----------|
| test_run_id               | Unique test run identifier (numeric) | `string` | n/a     | yes      |
| vnet_name                 | Name of durable VNet                 | `string` | n/a     | yes      |
| vnet_resource_group       | Resource group containing VNet       | `string` | n/a     | yes      |
| subnet_destroy_time_sleep | Cleanup wait time                    | `string` | `"5m"`  | no       |

## Outputs

| Name            | Description                           |
|-----------------|---------------------------------------|
| agent_subnet    | Full subnet resource object           |
| agent_subnet_id | Subnet ID (use in `agents_subnet_id`) |
| allocated_cidr  | CIDR allocated for this run           |
| subnet_name     | Subnet name (includes run ID)         |
| octet_value     | Third octet used (2-255)              |

## Collision Risk

**Probability of collision:**

- With 254 available slots and truly random distribution
- P(collision) ≈ 0% for <10 concurrent runs
- P(collision) ≈ 0.2% for 50 concurrent runs
- P(collision) ≈ 1.9% for 100 concurrent runs

**Mitigation:**

- GitHub Actions typically runs <10 concurrent workflows
- Scheduled cleanup job removes orphaned subnets (see parent README)
- Terraform will fail gracefully if collision occurs (subnet creation error)
- CI/CD can retry with new run ID

## Time Overhead

**Per Test Run:**

- Agent subnet creation: ~15-30 seconds
- Agent subnet deletion: ~30-60 seconds (with cleanup wait)
- **Total overhead: ~45-90 seconds per test**

**Compared to Full Setup:**

- Old approach: 8-12 minutes (VNet, DNS, Cosmos, Storage, Search, agent subnet)
- New approach: ~1 minute (agent subnet only)
- **Net savings: ~7-11 minutes per test run**

## Cleanup

Agent subnets are automatically destroyed when the test completes. However, if a test fails before cleanup, the subnet may become orphaned.

**Scheduled Cleanup Job:**
See `.github/workflows/cleanup_orphaned_subnets.yml` for automated cleanup of orphaned agent subnets older than 2 hours.

## Example

Create an ephemeral agent subnet:

```bash
terraform init
terraform apply \
  -var="test_run_id=12345678" \
  -var="vnet_name=vnet-foundry-standard-private-test" \
  -var="vnet_resource_group=rg-foundry-standard-private-test"
```

Output:

```text
allocated_cidr = "172.16.42.0/24"
subnet_name = "agent-12345678"
agent_subnet_id = "/subscriptions/.../subnets/agent-12345678"
```

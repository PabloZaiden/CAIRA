# Durable infrastructure pools

This directory contains Terraform modules that provision durable supporting infrastructure for CAIRA validation. These pools keep long-lived networking and capability-host resources available so nightly validation can focus on deploying and destroying the app-layer resources for each deployment strategy.

## Available pools

- `foundry_basic_private/` — shared private networking for private basic profiles
- `foundry_standard_private/` — shared private networking plus capability-host resources for private standard profiles

## How the pools are used

- Local integration workflows can provision or inspect them with the root Taskfile.
- Nightly validation reuses them while each strategy job deploys and destroys only the strategy-specific application layer.

## Useful commands

```bash
task tf:test:pools:deploy
task tf:test:pools:outputs
task tf:test:pools:outputs:env
```

## Local maintenance

You can also manage a pool directly with Terraform, for example:

```bash
cd infra/testing/infrastructure_pools/foundry_basic_private
terraform init
terraform apply
```

<!-- BEGIN_TF_DOCS -->

<!-- END_TF_DOCS -->

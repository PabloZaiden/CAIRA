# Strategy Builder Prerequisites

This guide is for contributors working on the CAIRA repository. Most users should install the CAIRA skill and let their coding agent inspect the strategy-builder assets as reference material.

## Tooling

The strategy-builder workflows rely on Node.js, Docker, Azure CLI, Terraform, and .NET alongside the repo-wide validation tooling.

## Recommended setup

From the repository root:

```bash
task setup
```

That command prepares the local environment and installs the workspace dependencies used by the strategy builder.

## Verify the strategy-builder environment

```bash
cd strategy-builder
./scripts/verify-environment.sh
```

## Important note

The repository already contains the CAIRA reference architectures and reusable modules under `infra/`. No extra CAIRA checkout, version pin file, or bootstrap clone step is required.

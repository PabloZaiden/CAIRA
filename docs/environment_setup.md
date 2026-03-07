<!-- META
 title: Environment Setup
 description: Configure a local or container-based CAIRA development environment.
 author: CAIRA Team
 ms.topic: guide
-->

# Environment Setup

For most users, the primary CAIRA entrypoint is the installed CAIRA skill. Install the skill in your coding agent and let the agent inspect this repository as reference material for your scenario. Use the rest of this page only if you are contributing to CAIRA itself or validating upstream assets locally.

## Contributor path: devcontainer

The repository devcontainer is the fastest way to get a working CAIRA environment because it is prepared for both the infrastructure workflows and the strategy-builder workflows.

## Contributor local machine setup

Install [Task](https://taskfile.dev/installation) first, then run:

```bash
task setup
```

This prepares the full local toolchain used across the repository, including:

- Terraform validation and documentation tooling
- security and markdown linters
- Node.js, .NET, and strategy-builder prerequisites
- workspace dependencies for the strategy builder

## Optional contributor verification

For a detailed app-layer prerequisite check, run:

```bash
cd strategy-builder
./scripts/verify-environment.sh
```

## Azure authentication

Authenticate with Azure before running deployment or integration workflows:

```bash
az login
eval "$(task tf:env:setup)"
```

## Typical contributor first commands

```bash
task validate:pr
task strategy:deploy:reference
task strategy:deploy:strategy -- deployment-strategies/typescript-openai-agent-sdk
```

## Notes

- Clone the repository only when contributing to CAIRA itself or validating upstream assets directly.
- The repository already contains the CAIRA foundation reference architecture and modules. No extra CAIRA checkout is required beyond the contributor clone you are already using.
- Docker is required for local strategy compose workflows and for deployed strategy image builds.
- Nightly-style validation depends on Azure access plus the durable infrastructure pool variables configured in GitHub.

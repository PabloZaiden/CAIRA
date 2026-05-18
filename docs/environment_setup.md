<!-- META
 title: Environment Setup
 description: Configure a local or container-based CAIRA development environment.
 author: CAIRA Team
 ms.topic: guide
-->

# Environment Setup

For most users, the primary CAIRA entrypoint is the installed CAIRA skill. Install it with the quickstart in the repository root README, then let the agent inspect this repository as reference material for your scenario. Use the rest of this page only if you are contributing to CAIRA itself or validating CAIRA locally.

## Contributor path: devcontainer

The repository devcontainer is the fastest way to get a working CAIRA environment because it is prepared for both the infrastructure workflows and the strategy-builder workflows. The default contributor definition now lives at `.devcontainer/devcontainer.json` and uses Docker-in-Docker.

## Contributor local machine setup

Install [Task](https://taskfile.dev/installation) first, then run:

```bash
task setup
```

This prepares the full local toolchain used across the repository, including:

- Terraform validation and documentation tooling
- security and markdown linters
- Node.js, Python, .NET, Azure CLI, Bun, uv, and the strategy-builder workspace prerequisites
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
task strategy:dev -- deployment-strategies/foundry_agentic_app/typescript-openai-agent-sdk-aca
task strategy:deploy -- deployment-strategies/foundry_agentic_app/typescript-openai-agent-sdk-aca
```

For the full scenario-based decision tree, including infrastructure changes,
baseline deployments, workflow edits, strategy regeneration, and private
networking or capability-host validation, continue with the
[Developer Guide](developer.md).

If you want your local Docker Compose stack to talk to real Azure services instead of mocks, use:

```bash
task strategy:dev:azure -- deployment-strategies/foundry_agentic_app/typescript-foundry-agent-service-aca
```

If that Azure-backed validation depends on the durable private-network pools,
prepare them first:

```bash
task tf:test:pools:deploy
eval "$(task tf:test:pools:outputs:env)"
```

Use `task strategy:deploy:reference` only when you are specifically validating the shared baseline deployment or regenerating strategy `.env` files from that baseline.

## Notes

- Clone the repository only when contributing to CAIRA itself or validating CAIRA directly.
- The repository already contains the CAIRA reference architectures and reusable modules. No extra CAIRA checkout is required beyond the contributor clone you are already using.
- Docker is required for local strategy compose workflows and for deployed strategy image builds.
- Nightly-style validation depends on Azure access plus the durable infrastructure pool variables configured in GitHub.

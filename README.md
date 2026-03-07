# CAIRA

CAIRA (Composable AI Reference Architectures) is a single repository for composing, validating, and deploying Azure AI solutions end to end. It includes the shared foundation infrastructure, reusable infrastructure modules, application-layer components, a strategy builder that assembles supported deployment strategies, and the generated deployment strategies that CI validates every night.

For most users, the primary way to use CAIRA is to install the CAIRA skill and let a coding agent inspect this repository as reference material. Clone the repository only if you want to contribute to CAIRA itself or validate upstream assets directly.

## What CAIRA contains

- `infra/architectures/` — foundation reference architectures for Azure AI workloads.
- `infra/modules/` — reusable Terraform modules consumed by the reference architectures and generated strategies.
- `infra/testing/` — Terraform test fixtures plus durable infrastructure pools reused by nightly validation.
- `strategy-builder/` — source-of-truth application components, contracts, generators, and validation tooling.
- `deployment-strategies/` — generated, committed end-to-end deployments built from the strategy builder.
- `docs/` and `skills/` — contributor guidance, operating docs, and discovery assets.

CAIRA is not Terraform-only and not infrastructure-only. The repository intentionally spans foundation infra, application infra, application components, and the generation of supported end-to-end deployment combinations.

## Primary entrypoint: CAIRA skill

1. Install the CAIRA skill defined under `skills/caira/` in your coding agent or agent platform.
1. Ask the agent to inspect the CAIRA reference architectures, modules, strategy-builder assets, deployment strategies, and docs that fit your scenario.
1. Let the agent adapt those discovered CAIRA assets into a solution for your specific use case.
1. Use the repository directly only when you need to contribute upstream or validate CAIRA itself.

## Contribute to the CAIRA repository

1. Clone the repository.
1. Preferred: open the repository in the provided devcontainer.
1. Local setup: install Task, then run `task setup`.
1. Authenticate with Azure when you need deployment or integration workflows: `az login`.
1. Use the Taskfile-first workflow from the repository root.

## Contributor Taskfile-first workflows

| Command                                                          | Purpose                                                  |
|------------------------------------------------------------------|----------------------------------------------------------|
| `task bootstrap`                                                 | Install workspace dependencies after tools are available |
| `task validate:pr`                                               | Run the fast pull-request validation suite               |
| `task test`                                                      | Run the full local validation suite                      |
| `task strategy:generate`                                         | Regenerate committed deployment strategies               |
| `task strategy:deploy:reference`                                 | Deploy or refresh the shared CAIRA foundation            |
| `task strategy:deploy:strategy -- deployment-strategies/<name>`  | Deploy one generated deployment strategy to Azure        |
| `task strategy:destroy:strategy -- deployment-strategies/<name>` | Destroy one generated deployment strategy deployment     |
| `task strategy:test:deployed -- deployment-strategies/<name>`    | Deploy, validate, and destroy one deployment strategy    |
| `task validate:nightly -- deployment-strategies/<name>`          | Reproduce the nightly flow locally for one strategy      |

## Repository model

```text
CAIRA/
├── infra/
│   ├── architectures/
│   ├── modules/
│   └── testing/
├── strategy-builder/
├── deployment-strategies/
├── docs/
└── skills/
```

- The foundation reference architecture under `infra/architectures/foundry-agent-api-frontend/` establishes the shared Azure AI foundation.
- The strategy builder turns reusable app-layer components plus infrastructure templates into committed deployment strategies.
- `deployment-strategies/` is generated output and should stay in sync with `strategy-builder/`.

## Validation model

- **Pull requests** run fast static validation only: linting, formatting, docs generation, docs build, Terraform validation, generator drift checks, and security scanners.
- **Nightly validation** runs Terraform acceptance coverage and deploys, validates, and destroys every committed deployment strategy in parallel while reusing durable supporting infrastructure.

## Learn more

- Start with `skills/caira/SKILL.md` if you want to use CAIRA through a coding agent.
- Start with `docs/README.md` for contributor and operator documentation.
- Review `infra/README.md` for the infrastructure layout.
- Review `strategy-builder/README.md` for the app-layer and generator workflow.
- Review the `deployment-strategies/*/README.md` files for generated strategy expectations.

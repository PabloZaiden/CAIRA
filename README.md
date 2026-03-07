# CAIRA

CAIRA (Composable AI Reference Architectures) is a single repository for composing, validating, and deploying Azure AI solutions end to end. It includes deployable macro reference architectures, reusable infrastructure modules, application-layer components, a strategy builder that assembles supported deployment strategies, and the generated deployment strategies that CI validates every night.

For most users, the primary way to use CAIRA is to install the CAIRA skill and let a coding agent inspect this repository as reference material. Clone the repository only if you want to contribute to CAIRA itself or inspect the source directly.

## Quickstart

Install the CAIRA skill from your project directory, then ask your coding agent to inspect CAIRA and adapt what it finds to your scenario.

### Prerequisites

If you do not already have `bunx` or `npx`, install Bun first:

```bash
curl -fsSL https://bun.com/install | bash
```

Restart your terminal, then verify:

```bash
bun --version
```

For Windows instructions, see <https://bun.com/docs/installation>.

### Install the skill

```bash
cd /path/to/your-project
```

Using Bun:

```bash
bunx skills add github.com/microsoft/caira/skills
```

Using NPX:

```bash
npx skills add github.com/microsoft/caira/skills
```

After installation, restart your agent session and ask it to inspect CAIRA for your scenario. For example: `Use CAIRA to design an Azure AI solution with Foundry, an API, and a frontend.`

## What CAIRA contains

- `infra/foundry_agentic_app/` — the default deployable reference architecture, composed from a Foundry foundation plus composable application-platform and service layers.
- `infra/modules/` — reusable Terraform modules consumed by the reference architectures and generated strategies.
- `infra/testing/` — Terraform test fixtures plus durable infrastructure pools reused by nightly validation.
- `strategy-builder/` — source-of-truth application components, contracts, generators, and validation tooling.
- `deployment-strategies/` — generated, committed end-to-end deployments built from the strategy builder.
- `docs/` and `skills/` — contributor guidance, operating docs, and discovery assets.

CAIRA is not Terraform-only and not infrastructure-only. The repository intentionally spans macro reference-architecture infra, application infra, application components, and the generation of supported end-to-end deployment combinations.

## Primary entrypoint: CAIRA skill

1. Install the CAIRA skill with `bunx skills add github.com/microsoft/caira/skills` or `npx skills add github.com/microsoft/caira/skills`.
1. Ask the agent to inspect the CAIRA reference architectures, modules, strategy-builder assets, deployment strategies, and docs that fit your scenario.
1. Let the agent adapt those discovered CAIRA assets into a solution for your specific use case.
1. Use the repository directly only when you need to contribute to CAIRA itself or inspect the source directly.

## Contribute to the CAIRA repository

1. Clone the repository.
1. Preferred: open the repository in the provided devcontainer.
1. Local setup: install Task, then run `task setup`.
1. Authenticate with Azure when you need deployment or integration workflows: `az login`.
1. Use the Taskfile-first workflow from the repository root.

## Contributor Taskfile-first workflows

| Command                                                       | Purpose                                                |
|---------------------------------------------------------------|--------------------------------------------------------|
| `task setup`                                                  | Prepare a local machine for CAIRA development          |
| `task validate:pr`                                            | Run the fast pull-request validation suite             |
| `task test`                                                   | Run the full local validation suite                    |
| `task strategy:generate`                                      | Regenerate committed deployment strategies             |
| `task strategy:dev -- deployment-strategies/<name>`           | Run one generated strategy locally with Docker Compose |
| `task strategy:dev:azure -- deployment-strategies/<name>`     | Run one generated strategy locally against Azure       |
| `task strategy:deploy -- deployment-strategies/<name>`        | Deploy one generated deployment strategy to Azure      |
| `task strategy:destroy -- deployment-strategies/<name>`       | Destroy one generated deployment strategy deployment   |
| `task strategy:test:deployed -- deployment-strategies/<name>` | Deploy, validate, and destroy one deployment strategy  |

Use `task strategy:deploy:reference` only for specialized maintenance work: deploying the shared baseline infrastructure or regenerating strategy `.env` files from it. Most contributors should ignore this command and use the standard strategy commands above.

## Repository model

```text
CAIRA/
├── infra/
│   ├── foundry_agentic_app/
│   ├── modules/
│   └── testing/
├── strategy-builder/
├── deployment-strategies/
├── docs/
└── skills/
```

- The default reference architecture under `infra/foundry_agentic_app/` establishes the layered CAIRA baseline: Foundry foundation first, then composable application-platform and service layers.
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

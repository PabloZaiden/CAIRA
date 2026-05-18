<!-- META
 title: Developer Guide
 description: Day-to-day development guide for CAIRA contributors.
 author: CAIRA Team
 ms.topic: guide
-->

# Developer Guide

This guide is for contributors working on the CAIRA repository itself. If you
want to use CAIRA in your own solution, install the CAIRA skill and let your
coding agent use this repository as reference material.

If you are adding or changing components, variants, templates, or deployment
strategies, start with [Extending CAIRA](contributing/extending_caira.md). Use
this page as the scenario matrix and command reference.

CAIRA spans infrastructure, generated deployments, and app-layer source code.
The safest contributor workflow is:

1. make changes in the source-of-truth layer
1. run the matching root `task ...` command from the repository root
1. regenerate or redeploy only when the scenario requires it
1. commit both the source change and any intentional generated output

`deployment-strategies/` is generated and committed output. Do not hand-edit it;
change the source in `strategy-builder/` or the shared infrastructure first,
then regenerate.

## Contributor operating model

Use this directory map to decide where to start:

```text
strategy-builder/infra/reference-architectures/foundry_agentic_app  Shared layered baseline reference architecture
strategy-builder/infra/modules              Reusable Terraform modules
strategy-builder/infra/testing              Terraform tests plus durable private-network pools
strategy-builder/          App components, variants, generator, deployment tooling
deployment-strategies/     Generated, committed end-to-end strategy outputs
```

## One-time contributor setup

1. Prefer the repository devcontainer whenever possible. It is prepared for the
   full CAIRA workflow.
1. If you are using a local machine, install Task first and then run:

   ```bash
   task setup
   ```

   This installs repo tooling, strategy-builder prerequisites, and workspace
   dependencies.
1. Before running Azure-backed workflows, authenticate and export the active
   subscription:

   ```bash
    az login
    eval "$(task tf:env:setup)"
    ```

1. For the hardened ACA strategies, make sure the deployment identity can do more than subscription-scoped Azure RBAC. It must also be able to create the Entra application registrations, service principals, and app-role assignments used for the frontend -> API -> agent token flow.

1. Keep Docker running before using the local compose or image-building tasks.
1. Treat durable infrastructure pools as shared test assets. Only deploy or
   refresh them when you are validating private networking or capability-host
   scenarios.

## Scenario-to-task map

Use this table first, then follow the detailed playbook for the scenario.

| If you changed...                                                                                                                              | Start with...                                                              | Go deeper with...                                                                                                                             | Commit expectations                                                                       |
|------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| Docs, markdown, or contributor guidance                                                                                                        | `task validate:pr`                                                         | `task docs` if Terraform docs or Markdown-generated files changed                                                                             | Commit the doc edits and any intentional generated doc updates                            |
| GitHub workflows, Taskfiles, or repo automation scripts                                                                                        | `task lint` and `task validate:pr`                                         | Manual workflow dispatch after merge when the workflow supports it                                                                            | Explain the trigger, permissions, and rollout impact in the PR                            |
| `strategy-builder/infra/modules/`, `strategy-builder/infra/reference-architectures/foundry_agentic_app/`, or `strategy-builder/infra/testing/` | `task validate:pr`                                                         | `task strategy:test:local`; use the pool tasks plus `task strategy:test:deployed` when Azure or private-network behavior changed              | Commit Terraform doc updates and any intentional generated files                          |
| Shared baseline deployment or strategy `.env` synchronization                                                                                  | `task strategy:deploy:reference`                                           | `task strategy:test:deployed -- deployment-strategies/<reference-architecture>/<name>`                                                        | Commit the source change plus the refreshed strategy env output                           |
| `strategy-builder/` components, variants, templates, or generator logic                                                                        | `task strategy:generate`                                                   | `task strategy:test:local`, `task strategy:dev`, `task strategy:dev:azure`, or `task strategy:test:deployed`                                  | Commit both the source change and the regenerated `deployment-strategies/` diff           |
| Private networking or capability-host wiring                                                                                                   | `task tf:test:pools:deploy` and `eval "$(task tf:test:pools:outputs:env)"` | `task strategy:dev:azure`, `task strategy:test:deployed`, or `task validate:nightly -- deployment-strategies/<reference-architecture>/<name>` | Keep the sample code lean; document the wiring instead of cloning near-duplicate variants |

## Root task reference

These are the main repository entrypoints. Start here unless you are doing a
targeted deep dive.

| Command                                                                          | Use it when                                           | What it runs                                                                                                                    | What you are expected to do                                                                                     |
|----------------------------------------------------------------------------------|-------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------|
| `task setup`                                                                     | Setting up a new local machine                        | OS-specific prerequisite install, then `task tools`, then `task bootstrap`                                                      | Install Task first, satisfy OS prerequisites, and rerun if your workstation toolchain drifts                    |
| `task tools`                                                                     | Refreshing repo-wide CLIs and linters                 | Bash, GitHub, JavaScript, Markdown, security, spelling, Terraform, YAML, and site tool installers                               | Use when local tools are missing or outdated; it does not install strategy-builder workspace packages by itself |
| `task bootstrap`                                                                 | Preparing app-layer workspace dependencies            | `task strategy:install`                                                                                                         | Rerun after dependency changes or after switching to a branch with updated lockfiles                            |
| `task lint`                                                                      | Fast static checks without docs/site generation       | `sh:lint`, `gh:lint`, `js:lint`, `md:lint`, `sec:lint`, `spell:lint`, `tf:lint`, and `yml:lint`                                 | Fix the underlying source issue rather than forcing generated output into compliance                            |
| `task docs`                                                                      | Refreshing generated docs before review               | `task tf:docs`, `task spell:lint`, and `task md:lint`                                                                           | Review and commit generated README changes if Terraform inputs, outputs, or examples changed                    |
| `task validate:pr`                                                               | Pre-PR validation for almost every change             | `task tf:docs`, `task lint`, `task strategy:validate:pr`, and `task site:build -- --strict`, then checks the git diff for drift | Run this before opening or updating a PR; if it changes files, regenerate the expected output and commit it     |
| `task test`                                                                      | Broad local validation for risky infra or app changes | `task strategy:test:local`                                                                                                      | Expect a longer run; use it when static validation is not enough                                                |
| `task validate:nightly -- deployment-strategies/<reference-architecture>/<name>` | Reproducing the nightly path for one strategy         | `task validate:pr` and `task strategy:test:deployed -- <strategy>`                                                              | Use before merging changes that could break deployed validation; pass a real strategy path                      |
| `task clean`                                                                     | Removing local build and Terraform residue            | Terraform and docs-site cleanup tasks                                                                                           | Use after local experiments; do not rely on it to remove cloud resources                                        |

## Terraform and infrastructure test tasks

Use these when you are working directly in `strategy-builder/infra/` or when a
strategy change depends on infrastructure behavior.

The standalone `terraform test` acceptance and integration suites were removed
because their assertions were redundant with the generated-strategy validation
path. For meaningful infra changes, use `task validate:pr`, then escalate to
`task strategy:test:local` and Azure-backed strategy validation when the change
affects real deployment behavior.

| Command                          | Use it when                                             | What it does                                                                           | What you are expected to do                                                                              |
|----------------------------------|---------------------------------------------------------|----------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| `task tf:env:login`              | You want Task to handle Azure login                     | Runs `az login` if needed                                                              | Use before Azure-backed Terraform tasks when your CLI session is expired                                 |
| `task tf:env:setup`              | You need Terraform environment variables                | Emits `export ARM_SUBSCRIPTION_ID=...` when Azure CLI is authenticated                 | Run `eval "$(task tf:env:setup)"` before Azure-backed testing                                            |
| `task tf:docs`                   | Terraform README blocks may have changed                | Regenerates Terraform docs across modules, reference architecture, and testing assets  | Review the README diff and commit the intended updates                                                   |
| `task tf:lint`                   | You changed Terraform or Terraform-adjacent docs        | Runs `terraform fmt`, `tflint`, and `terrafmt` checks                                  | Fix formatting and lint issues in the source files                                                       |
| `task tf:test:pools:deploy`      | You need the private networking pools available locally | Deploys or reuses `private_foundry_pool/` and `private_foundry_capability_hosts_pool/` | Treat the pools as durable shared infra; do not destroy them casually                                    |
| `task tf:test:pools:outputs`     | You need to inspect pool values                         | Prints Terraform outputs for both durable pools                                        | Use it to troubleshoot naming, networking, and DNS details                                               |
| `task tf:test:pools:outputs:env` | You want pool outputs as shell exports                  | Emits `TF_VAR_private_foundry_*` exports for the durable pools                         | Run `eval "$(task tf:test:pools:outputs:env)"` before local Azure-backed validation that needs the pools |

## Strategy-builder and deployment tasks

Use these when you are changing app components, variants, templates, generated
strategies, or their Azure deployment path.

| Command                                                                                | Use it when                                                                    | What it does                                                                                                                | What you are expected to do                                                                |
|----------------------------------------------------------------------------------------|--------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------|
| `task strategy:generate`                                                               | You changed `strategy-builder/` source-of-truth assets                         | Regenerates committed deployment strategies                                                                                 | Review every generated diff under `deployment-strategies/` and never hand-edit those files |
| `task strategy:validate:drift`                                                         | You want to confirm generated output matches the source                        | Runs the drift checker without the rest of PR validation                                                                    | Use after generation or when investigating unexpected strategy diffs                       |
| `task strategy:validate:pr`                                                            | You changed app-layer logic and want the fast static subset                    | Runs `node scripts/test-all.ts --layer L1,L7,L8`                                                                            | Use directly only when you are already focused on strategy-builder work                    |
| `task strategy:test:local`                                                             | You need the full local app-layer suite                                        | Runs the full `test-all.ts` suite                                                                                           | Expect broader coverage than PR validation, including local compose-related checks         |
| `task strategy:test:azure`                                                             | You need the app-layer suite with Azure compose coverage                       | Runs `test-all.ts --include-azure`                                                                                          | Authenticate with Azure first and use it when local mocks are not enough                   |
| `task strategy:dev -- deployment-strategies/<reference-architecture>/<name>`           | You want an interactive local compose loop                                     | Starts the selected generated strategy locally with Docker Compose                                                          | Use for debugging and smoke tests; keep Docker running                                     |
| `task strategy:dev:azure -- deployment-strategies/<reference-architecture>/<name>`     | You want the local stack to talk to real Azure resources                       | Starts the selected strategy locally against Azure                                                                          | Authenticate with Azure first and export any required pool variables                       |
| `task strategy:deploy -- deployment-strategies/<reference-architecture>/<name>`        | You want to keep a deployed strategy alive for manual inspection               | Deploys the selected generated strategy to Azure                                                                            | Use `--test-profile <profile>` when you need a specific public/private deployment mode     |
| `task strategy:destroy -- deployment-strategies/<reference-architecture>/<name>`       | You finished manual Azure validation                                           | Destroys one deployed strategy                                                                                              | Use after `task strategy:deploy` or after interrupted manual tests                         |
| `task strategy:test:deployed -- deployment-strategies/<reference-architecture>/<name>` | You need a full deploy/validate/destroy lifecycle                              | Deploys, validates, and destroys one strategy across `public`, `private`, and `private-capability-host` profiles by default | Use `--test-profile <profile>` to narrow the matrix during local debugging                 |
| `task strategy:deploy:reference`                                                       | You are explicitly working on the shared baseline or strategy `.env` sync path | Deploys or refreshes the baseline reference architecture and rewrites strategy env files                                    | Use sparingly; this is maintainer-style work, not an everyday contributor task             |

If one of the Azure-backed strategy tasks fails at `azuread_service_principal` or `azuread_app_role_assignment` with `403 Authorization_RequestDenied`, treat that as an environment permission issue first. The sample now relies on tenant-level Entra objects for its hardened inter-service auth path, so subscription `Contributor` / `User Access Administrator` alone may still be insufficient.

## Scenario playbooks

### 1. Docs-only or contributor-guide changes

1. Update the Markdown source under `docs/`, `README.md`, or another
   contributor-facing file.
1. Run `task validate:pr`.
1. If `task validate:pr` rewrites Terraform docs, review the diff and commit the
   intended changes.
1. Open the PR. After merge, `ghpages.yml` will rebuild the documentation site
   when the change touches `docs/**` or `mkdocs.yml`.

### 2. GitHub workflow, Taskfile, or repo automation changes

1. Change the workflow, Taskfile, or supporting script.
1. Run `task lint` so Actionlint, shell linting, YAML linting, and the other
   repo checks all run together.
1. Run `task validate:pr` to confirm the broader static workflow still passes.
1. In the PR description, explain:
   - what now triggers the automation
   - why the permissions are correct
   - whether the workflow is scheduled, manual, push-based, or PR-based
1. After merge, use a manual dispatch if the workflow supports it. Otherwise,
   wait for the normal trigger instead of inventing a parallel workflow.

### 3. Terraform module, reference-architecture, or test-fixture changes

1. Make the change in `strategy-builder/infra/modules/`, `strategy-builder/infra/reference-architectures/foundry_agentic_app/`, or
   `strategy-builder/infra/testing/`.
1. Run `task tf:docs` whenever README inputs, outputs, or examples may have
   changed.
1. Run `task validate:pr`.
1. Run `task strategy:test:local` for broad local coverage when the infra
   change affects generated strategies or container behavior.
1. If the change affects private networking, durable DNS, or other pool-backed
   integration behavior, deploy the shared pools and then run Azure-backed
   strategy validation:

   ```bash
   task tf:test:pools:deploy
   eval "$(task tf:test:pools:outputs:env)"
   task strategy:test:deployed -- --test-profile private deployment-strategies/<reference-architecture>/<name>
   ```

1. If the change affects generated deployments, continue with the shared
   baseline or strategy playbook below.

### 4. Shared baseline deployment or strategy `.env` synchronization changes

Use this only when you are changing the shared baseline itself or the mechanism
that rewrites strategy env files from that baseline.

1. Authenticate with Azure and export the Terraform environment:

   ```bash
   az login
   eval "$(task tf:env:setup)"
   ```

1. Run:

   ```bash
   task strategy:deploy:reference
   ```

1. Review the resulting `.env` and baseline-related diffs under
   `deployment-strategies/`.
1. Pick at least one affected generated strategy and run:

   ```bash
   task strategy:test:deployed -- --test-profile public deployment-strategies/<reference-architecture>/<name>
   ```

1. Commit the source change and the refreshed generated output together.

### 5. New app components, variants, templates, or generator logic

This is the common workflow when you add a new component or change how
deployment strategies are assembled.

1. Change the source-of-truth asset under `strategy-builder/`.
1. Regenerate strategies:

   ```bash
   task strategy:generate
   ```

1. Review the generated diff under `deployment-strategies/`. Do not fix the
   output by hand.
1. Run `task strategy:validate:drift` if you want a focused generation check.
1. Run `task validate:pr` to cover the repo-wide static suite.
1. Run `task strategy:test:local` when the change affects behavior, wiring,
   images, or tests beyond static validation.
1. Smoke-test at least one representative strategy locally:

   ```bash
   task strategy:dev -- deployment-strategies/<reference-architecture>/<name>
   ```

1. If the change touches Azure integration, also run one of:

   ```bash
    task strategy:dev:azure -- deployment-strategies/<reference-architecture>/<name>
    task strategy:test:azure
    task strategy:test:deployed -- --test-profile public deployment-strategies/<reference-architecture>/<name>
    ```

1. Commit the `strategy-builder/` source change and the regenerated
   `deployment-strategies/` diff together.

### 6. Local compose debugging versus deployed Azure validation

Use the lightest workflow that proves the change:

- Use `task strategy:dev` when you need a fast inner loop with Docker Compose.
- Use `task strategy:dev:azure` when local mocks are no longer representative.
- Use `task strategy:deploy` plus `task strategy:destroy` when you want a
  deployed environment to inspect manually.
- Use `task strategy:test:deployed` when you want CI-like confidence from a
  deploy/validate/destroy lifecycle across the deployed profile matrix.
- Use `task validate:nightly -- deployment-strategies/<reference-architecture>/<name>` when you want to
  reproduce the nightly path, including the static repo validation and the full
  deployed profile matrix.

### 7. Private networking and capability-host validation with the current design

The repository intentionally keeps the sample code lean and explains how to wire
private networking and capability hosts through docs and comments. Do not
reintroduce those scenarios as near-duplicate minor variants.

Today the supported validation path is:

1. Deploy or refresh the durable pools when needed:

   ```bash
   task tf:test:pools:deploy
   ```

1. Export their outputs into your shell:

   ```bash
   eval "$(task tf:test:pools:outputs:env)"
   ```

1. Run the smallest meaningful Azure-backed validation:

   ```bash
   task strategy:dev:azure -- deployment-strategies/<reference-architecture>/<name>
   ```

1. For end-to-end proof, escalate to:

   ```bash
   task strategy:test:deployed -- deployment-strategies/<reference-architecture>/<name>
   task validate:nightly -- deployment-strategies/<reference-architecture>/<name>
   ```

   `task strategy:test:deployed` now runs `public`, `private`, and
   `private-capability-host` by default. The private profiles keep the frontend
   on VNet-scope ingress inside the internal Container Apps environment and also
   provision the per-environment private DNS records that the jumpbox needs to
   resolve those hostnames. During local investigation you can scope the run,
   for example:

   ```bash
   task strategy:test:deployed -- --test-profile private deployment-strategies/<reference-architecture>/<name>
   task strategy:deploy -- --test-profile private deployment-strategies/<reference-architecture>/<name>
   ```

1. Keep the reusable private-network and capability-host assets in
    `strategy-builder/infra/testing/infrastructure_pools/`; keep the feature wiring in the source
    templates and docs rather than cloning almost-identical strategies.

## GitHub Actions: what runs automatically

These workflows already cover the repository-wide automation model.

| Workflow                                   | Trigger                                               | What it runs                                                                                                                | What developers should expect                                                                      |
|--------------------------------------------|-------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| `.github/workflows/pr.yml`                 | Pull requests targeting `main`                        | Dependency review, semantic PR title check, and the fast repo validation path (`task validate:pr`)                          | Every contributor PR should pass this before merge; it is intentionally static and fast            |
| `.github/workflows/nightly-validation.yml` | Daily schedule and manual dispatch                    | Deploy/validate/destroy for the selected or discovered strategies across `public`, `private`, and `private-capability-host` | Use it for post-merge confidence and for one-strategy reproduction through `task validate:nightly` |
| `.github/workflows/codeql.yml`             | Pull requests, pushes to `main`, and weekly schedule  | CodeQL analysis for Actions, JavaScript/TypeScript, and C#                                                                  | Expect security findings here, not runtime deployment validation                                   |
| `.github/workflows/ghpages.yml`            | Pushes to `main` that touch `docs/**` or `mkdocs.yml` | Strict MkDocs build and GitHub Pages deployment                                                                             | Docs contributors do not need a separate publish step after merge                                  |

No additional GitHub workflow is required for the current contributor model.
The existing workflow set already covers PR validation, nightly Azure-backed
validation, security scanning, and docs publishing.

## What should stay local or manually invoked

These commands are intentionally not always-on GitHub workflows:

- `task setup`, `task tools`, `task bootstrap`, and `task clean` are workstation
  operations.
- `task strategy:dev` and `task strategy:dev:azure` are interactive inner-loop
  commands.
- `task strategy:deploy`, `task strategy:destroy`, and
  `task strategy:deploy:reference` create or modify real Azure resources and
  should stay explicit.
- `task tf:test:pools:deploy`, `task tf:test:pools:outputs`, and
  `task tf:test:pools:outputs:env` manage durable shared infrastructure that
  contributors and maintainers may need to inspect deliberately.

## Validation model summary

- **PR validation** is intentionally fast and static: linting, formatting, docs
  generation, docs build, Terraform validation, generator drift checks, and
  security scanning.
- **Nightly validation** reuses durable supporting infrastructure and deploys,
  validates, and destroys each committed deployment strategy in parallel across
  the public and private deployed-profile matrix.
- **Developer-owned validation depth** still matters. Contributors are expected
  to choose the right local task sequence for the scenario instead of relying on
  PR validation alone.

## Direct component work

Most everyday workflows should start at the repository root via `task ...`.
When you are iterating inside a specific component in `strategy-builder/`,
direct `npm` or `dotnet` commands in that component directory are still fine for
the inner loop. Before opening a PR, return to the root tasks so the repository
level validation stays consistent.

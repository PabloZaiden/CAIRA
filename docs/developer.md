<!-- META
 title: Developer Guide
 description: Day-to-day development guide for CAIRA contributors.
 author: CAIRA Team
 ms.topic: guide
-->

# Developer Guide

This guide is for contributors working on the CAIRA repository itself. If you want to use CAIRA in your own solution, install the CAIRA skill and let your coding agent use this repository as reference material.

## Recommended contributor environment

Use the repository devcontainer whenever possible. It is configured for the full CAIRA workflow: foundation Terraform validation, strategy-builder development, deployment-strategy generation, local compose testing, and Azure-backed validation.

If you prefer a local machine setup, install Task first and then run:

```bash
task setup
```

That command installs the repo-level tooling, strategy-builder prerequisites, and the workspace dependencies used by the root Taskfile.

## Repository layout

```text
infra/architectures     Foundation reference architectures
infra/modules           Reusable Terraform modules
infra/testing           Terraform test helpers and durable pools
strategy-builder/       App-layer components, generator, and validation tooling
deployment-strategies/  Generated, committed end-to-end deployments
```

## Common contributor workflows

### Fast validation before opening a pull request

```bash
task validate:pr
```

This runs the same fast static validation suite used by the PR workflow.

### Full local validation

```bash
task test
```

This runs Terraform acceptance coverage plus the full local strategy-builder suite.

### Regenerate deployment strategies

```bash
task strategy:generate
```

Use this after changing generator logic, app-layer components, or shared strategy templates.

### Deploy the CAIRA foundation

```bash
task strategy:deploy:reference
```

### Deploy, validate, and destroy a generated deployment strategy

```bash
task strategy:test:deployed -- deployment-strategies/typescript-openai-agent-sdk
```

## Validation model

- **PR validation** is intentionally fast and static: linting, formatting, docs generation, docs build, Terraform validation, generator drift checks, and security scanning.
- **Nightly validation** reuses durable supporting infrastructure and deploys, validates, and destroys each committed deployment strategy in parallel.

## Direct component work

Most everyday workflows should start at the repository root via `task ...`. When you are iterating on a specific component inside `strategy-builder/`, direct `npm` or `dotnet` commands are still appropriate inside that component directory.

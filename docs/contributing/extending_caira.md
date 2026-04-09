<!-- META
 title: Extending CAIRA
 description: End-to-end workflow for adding components, variants, templates, and deployment strategies to CAIRA.
 author: CAIRA Team
 ms.topic: guide
-->

# Extending CAIRA

This is the main contributor workflow for changing CAIRA itself. Use it when you
are adding or changing components, variants, templates, generator logic,
deployment strategies, or shared infrastructure wiring.

If you want to use CAIRA as reference material for your own solution instead of
editing this repository, start with the repository root README and the CAIRA
skill.

## What counts as extending CAIRA

Use this guide when your change affects any of these areas:

- `strategy-builder/components/`
- `strategy-builder/scripts/`
- `strategy-builder/infra/`
- `deployment-strategies/` as generated output

Pair this guide with:

- [Developer Guide](../developer.md) for the full task matrix and scenario table
- [Pull Request Guide](pull_request_guide.md) for the final PR checklist
- `strategy-builder/README.md` for the strategy-builder layout
- `strategy-builder/docs/guide/adding-components.md` for component-level implementation details
- `strategy-builder/docs/guide/testing.md` for the deeper testing internals

## Golden rules

1. **Edit the source of truth, not the generated output.** Never hand-edit `deployment-strategies/`. Change `strategy-builder/` or shared infrastructure first, then regenerate.
1. **Use root `task ...` commands first.** Prefer the repository root Taskfile wrappers over ad hoc direct scripts unless you are debugging a specific tool.
1. **Commit generated output intentionally.** If your change rewrites `deployment-strategies/` or Terraform docs, review that diff and commit it together with the source change.

## Choose the right path

| If you want to...                                                                   | Start here                           | Then use...                                                                                          |
|-------------------------------------------------------------------------------------|--------------------------------------|------------------------------------------------------------------------------------------------------|
| Use CAIRA in your own solution                                                      | Repository root README + CAIRA skill | Let your agent inspect CAIRA as reference material                                                   |
| Add or change an app component or variant                                           | `strategy-builder/components/`       | `task strategy:generate`, `task validate:pr`, `task strategy:test:local`                             |
| Add or change a compute target or deployment-strategy IaC wrapper                   | `strategy-builder/components/iac/`   | `task strategy:generate`, `task validate:pr`, Azure-backed validation if deployment behavior changes |
| Change shared modules, reference architecture wiring, or infrastructure test assets | `strategy-builder/infra/`            | `task validate:pr`, then deeper local or Azure-backed validation as needed                           |
| Open or update a PR                                                                 | Repository root                      | `task validate:pr` plus any deeper checks your scenario requires                                     |

## One-time setup

From the repository root:

```bash
task setup
```

When your workflow needs Azure-backed validation:

```bash
az login
eval "$(task tf:env:setup)"
```

Keep Docker running before using the local compose or image-building workflows.

## End-to-end contributor workflow

### 1. Make the change in the source-of-truth layer

Start in the layer that owns the behavior:

- app components and variants: `strategy-builder/components/`
- deployment assembly and generation logic: `strategy-builder/scripts/`
- shared Terraform modules and reference architecture wiring: `strategy-builder/infra/`

Do not start by editing `deployment-strategies/`.

### 2. Use the fastest local inner loop first

Use the lightest check that proves the change while you iterate:

| Goal                                          | Recommended command                                                                    | Notes                                                        |
|-----------------------------------------------|----------------------------------------------------------------------------------------|--------------------------------------------------------------|
| Verify one component quickly                  | Run that component's local `npm`, `dotnet`, or equivalent test/lint/typecheck commands | Fastest inner loop while implementing                        |
| Regenerate committed deployment strategies    | `task strategy:generate`                                                               | Required when source-of-truth assets change generated output |
| Confirm generated output matches the source   | `task strategy:validate:drift`                                                         | Good focused check after generation                          |
| Run the repo-equivalent fast validation suite | `task validate:pr`                                                                     | Same static path used by the PR workflow                     |
| Run broader local app-layer coverage          | `task strategy:test:local` or `task test`                                              | Use when static validation is not enough                     |
| Smoke-test one generated strategy locally     | `task strategy:dev -- deployment-strategies/<reference-architecture>/<name>`           | Interactive Docker Compose loop                              |
| Run the local stack against Azure             | `task strategy:dev:azure -- deployment-strategies/<reference-architecture>/<name>`     | Use when mocks are no longer representative                  |
| Validate one deployed strategy end to end     | `task strategy:test:deployed -- deployment-strategies/<reference-architecture>/<name>` | Deploys, validates, and destroys                             |
| Reproduce the nightly path for one strategy   | `task validate:nightly -- deployment-strategies/<reference-architecture>/<name>`       | Includes `task validate:pr` plus deployed validation         |

### 3. Regenerate and review generated output

If your change affects app components, templates, generator logic, or
deployment-strategy IaC:

```bash
task strategy:generate
task strategy:validate:drift
```

Then review the resulting diff under `deployment-strategies/`. If the generated
output is correct, commit it with the source change. If it looks wrong, fix the
source-of-truth layer and regenerate again.

### 4. Validate locally at the right depth

Use this escalation order:

1. `task validate:pr` for the fast static repository suite
1. `task strategy:test:local` when the change affects behavior, compose wiring, images, or tests beyond static validation
1. `task strategy:dev -- ...` for an interactive smoke test of one representative generated strategy
1. `task strategy:dev:azure -- ...` or `task strategy:test:deployed -- ...` when the change depends on real Azure behavior

For private networking or capability-host scenarios, prepare the durable pool
infrastructure first:

```bash
task tf:test:pools:deploy
eval "$(task tf:test:pools:outputs:env)"
```

Then run the smallest meaningful Azure-backed validation, for example:

```bash
task strategy:dev:azure -- deployment-strategies/<reference-architecture>/<name>
task strategy:test:deployed -- --test-profile private deployment-strategies/<reference-architecture>/<name>
```

## What the PR pipeline actually runs

The pull request workflow is intentionally fast and static. It runs:

```bash
task validate:pr
```

That covers:

- Terraform docs generation
- repo-wide linting and scanners
- strategy-builder static validation (`L1`, `L7`, and `L8`)
- strict documentation site build
- drift detection by comparing the git diff before and after validation

The PR pipeline does **not** deploy strategies to Azure. Full deploy, validate,
and destroy coverage runs in the nightly workflow and can be reproduced locally
with `task validate:nightly -- ...` or `task strategy:test:deployed -- ...`.

## What to include in your PR

Before opening or updating a PR:

1. Run `task validate:pr`.
1. Commit any intentional Terraform doc or generated deployment-strategy updates.
1. Add or update contributor-facing documentation when behavior or workflows changed.
1. If deployed behavior changed, run and describe the deeper validation that matches your scope.

When your change affects generated strategies or app behavior, include these
details in the PR description:

- which representative strategy you tested locally
- whether you only ran the fast PR-equivalent suite or also deeper local or Azure-backed validation
- whether the change affected public, private, or private-capability-host behavior

## Common mistakes to avoid

- editing `deployment-strategies/` by hand instead of regenerating
- opening a PR with source changes but without the corresponding generated output
- treating `task validate:pr` as a full deployed Azure test; it is not
- skipping the pool setup steps before private-network or capability-host validation
- using direct internal scripts as the default workflow when a root `task ...` entrypoint already exists

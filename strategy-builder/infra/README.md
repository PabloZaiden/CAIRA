# CAIRA infrastructure

The `strategy-builder/infra/` tree contains the Terraform inputs owned by the strategy builder.

Most users should install the CAIRA skill and let their coding agent inspect this tree as reference material. Work directly in `strategy-builder/infra/` only when contributing to CAIRA itself or validating the reference assets directly.

## Layout

- `strategy-builder/infra/reference-architectures/foundry_agentic_app/` — the current default deployable reference architecture, composed from separate Foundry, application-platform, and per-service layers
- `strategy-builder/infra/modules/` — reusable Terraform modules shared across the repo
- `strategy-builder/infra/testing/` — Terraform support fixtures plus durable infrastructure pools used by deployed validation

## Default reference architecture

Start with:

```bash
cd strategy-builder/infra/reference-architectures/foundry_agentic_app
```

That directory defines the layered reference architecture used directly by infrastructure contributors and indirectly by generated deployment strategies. Additional reference architectures should live under `strategy-builder/infra/reference-architectures/` beside the shared `modules/` and `testing/` trees.

## How `strategy-builder/infra/` fits with the rest of the repo

- `strategy-builder/infra/` defines the reusable infrastructure modules, the deployable layered reference architectures, and the testing support Terraform used by the generator.
- `strategy-builder/` defines the application-layer components plus the logic that assembles supported deployment strategies from those inputs.
- `deployment-strategies/` contains the generated, committed end-to-end outputs grouped by reference architecture, for example `deployment-strategies/foundry_agentic_app/<strategy>/`.

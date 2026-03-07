# CAIRA infrastructure

The `infra/` tree contains the infrastructure side of CAIRA.

Most users should install the CAIRA skill and let their coding agent inspect this tree as reference material. Work directly in `infra/` only when contributing to CAIRA itself or validating the reference assets directly.

## Layout

- `infra/foundry_agentic_app/` — the current default deployable reference architecture, composed from separate Foundry, application-platform, and per-service layers
- `infra/modules/` — reusable Terraform modules shared across the repo
- `infra/testing/` — Terraform test fixtures plus durable infrastructure pools

## Default reference architecture

Start with:

```bash
cd infra/foundry_agentic_app
```

That directory defines the layered reference architecture used directly by infrastructure contributors and indirectly by generated deployment strategies. Additional reference architectures, if added later, should live directly under `infra/` beside `modules/` and `testing/`.

## How `infra/` fits with the rest of the repo

- `infra/` defines both the reusable infrastructure modules and the deployable layered reference architectures.
- `strategy-builder/` defines the application-layer components and the logic that assembles supported deployment strategies.
- `deployment-strategies/` contains the generated, committed end-to-end outputs that implement the same system shape with different technology choices.

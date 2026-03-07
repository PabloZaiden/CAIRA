# CAIRA infrastructure

The `infra/` tree contains the infrastructure side of CAIRA.

Most users should install the CAIRA skill and let their coding agent inspect this tree as reference material. Work directly in `infra/` only when contributing to CAIRA itself or validating the upstream foundation assets.

## Layout

- `infra/architectures/` — deployable foundation reference architectures
- `infra/modules/` — reusable Terraform modules shared across the repo
- `infra/testing/` — Terraform test fixtures plus durable infrastructure pools

## Foundation reference architecture

Start with:

```bash
cd infra/architectures/foundry-agent-api-frontend
```

That directory defines the shared Azure AI foundation used directly by infrastructure contributors and indirectly by generated deployment strategies.

## How `infra/` fits with the rest of the repo

- `infra/` defines the reusable infrastructure foundation.
- `strategy-builder/` defines the application-layer components and the logic that assembles supported deployment strategies.
- `deployment-strategies/` contains the generated, committed end-to-end outputs that combine both layers.

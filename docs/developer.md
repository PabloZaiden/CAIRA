# Developing CAIRA reference components

CAIRA components are examples for agents, not production templates that must deploy as one deterministic stack. Keep every component small, readable, and independently validatable.

## Component model

- `reference-architectures/iac/foundry/` owns the Foundry foundation.
- `reference-architectures/iac/container-apps/` owns hosting for exactly two containers: API and frontend.
- `reference-architectures/app/api/**` contains unified API + agent examples. There is no separate agent container.
- `reference-architectures/app/frontend/**` contains frontend references.

Do not add generator metadata, deployment-strategy manifests, local auth sidecars, testing overlays, or cross-component orchestration unless the project explicitly reintroduces those concepts later.

## Validation

Run:

```bash
task validate
```

The root validation delegates to each component's native tools:

- TypeScript: `npm run typecheck`, `npm test`, `npm run build`, Docker build.
- C#: `dotnet build`, Docker build.
- Terraform: `terraform fmt -check`, `terraform init -backend=false`, `terraform validate`.

Prefer adding a local script to a component over adding repo-wide orchestration.

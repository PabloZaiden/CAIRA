# Reference Architecture Selection (Dynamic)

This template is for coding agents to decide using discovered CAIRA assets, not hardcoded architecture names.

Start from `deployment-strategies/` and `docs/` first. Use the raw reference-architecture files in `strategy-builder/` when you need to understand the underlying source-of-truth beyond what the generated strategies and docs already show.

## Discovery steps

1. Resolve the discovery `ref`: default to `main` for browsing CAIRA. If the user later chooses `reference` mode for generated dependencies, pin those generated references to a specific release tag or commit instead of `main`.
1. List generated deployment strategies and relevant docs first:
   - `GET https://api.github.com/repos/pablozaiden/CAIRA/contents/deployment-strategies?ref=main`
   - `GET https://api.github.com/repos/pablozaiden/CAIRA/contents/docs?ref=main`
1. Use the discovered deployment strategies and docs to identify the closest end-to-end fit before drilling into raw infra.
1. List architectures dynamically when the generated strategies/docs are not enough:
   - `GET https://api.github.com/repos/pablozaiden/CAIRA/contents/strategy-builder/infra/reference-architectures?ref=main`
1. For each discovered architecture directory directly under `strategy-builder/infra/reference-architectures/`:
    - List files in that directory via contents API.
    - Read `README.md` and `*.tf` from returned `download_url` values.
    - Extract capabilities from content (networking posture, dependencies, capability host patterns, required inputs, complexity, observability components).
1. Default to reviewing `foundry_agentic_app` first because it is the baseline layered reference architecture sample.
1. Before selecting an architecture, determine whether the user needs the full stack or only one of these slices:
    - Foundry infra only
    - Foundry infra + application layer
    - application layer only
    - observability hookup only
    - APIM / AI gateway only
    - existing resource reuse by IDs, endpoints, or connection strings
1. Build a per-component intake matrix for app-layer pieces in scope, such as frontend, API, agent service/container, capability host, and other app-facing services.
1. For each needed app component, ask how it should run right now: local process/container only, existing hosting the user already has, or new Azure-hosted deployment.
1. For each needed app component, ask whether supporting assets are already provided or need to be created, such as registry, hosting, identity/auth wiring, ingress/endpoints, secrets/config, storage, and observability.
1. If a component should stay local for now, do not recommend Azure hosting, registry creation, or deployment automation for that component by default.
1. If a component is containerized, ask whether it should stay local, use an existing registry, or require a new registry plus push flow.
1. Before generating files, ask whether the user wants `copy` mode or `reference` mode for the selected CAIRA assets.
1. If the user chooses `reference` mode, ask whether they need a specific CAIRA release, tag, or commit. If they have no preference, prefer a release tag and otherwise fall back to a concrete commit SHA.
1. Treat each slice as an include/exclude decision. If a slice is out of scope, do not recommend copying it just to leave it disabled.
1. For APIM specifically, recommend the entire APIM slice only when the user needs gateway behavior, policies, or governance. Otherwise keep APIM out of scope completely.

## Decision rubric (content-driven)

For each discovered architecture, score fit by user requirements:

- Networking/security fit
- Agent-capability/data-service fit
- Application integration fit
- Component run/deployment fit (local-only, existing hosting, or new hosted deployment)
- Operational model fit (monitoring/compliance/enterprise controls)
- Complexity and maintainability fit

Treat capability-host connectivity, private networking, and extra projects as advanced requirements. If the user's needs are satisfied by the baseline sample, keep the recommendation anchored on the simpler default instead of copying those advanced additions.

Do not include `testing_overlay.tf`, `testing_variables.tf`, `testing_outputs.tf`, or related internal validation assets in the recommended architecture scope unless the user explicitly asks for testing or validation infrastructure.

Do not treat pirate-domain sample content as reusable business logic. Only reuse the architecture, composition, deployment, and observability patterns.

When recommending a subset of CAIRA, explain which slices are included and which are intentionally excluded so the user does not import extra components they do not need.

Pick highest fit score and provide alternatives.

## Output format

```text
Recommendation:
- selected: <architecture_name_from_discovery>
- reason: <short, evidence-based summary>

Component decisions:
- <component_name>: needed=<yes/no>, run=<local|existing_hosting|new_hosting>, assets=<provided|create>

Alternatives:
- <architecture_name_from_discovery>: <tradeoff>
- <architecture_name_from_discovery>: <tradeoff>

Evidence URLs:
- <repo file URL>
- <repo file URL>
```

## Confirmation gate

Always require explicit user confirmation before generating or modifying files, including the chosen `copy` vs `reference` mode, the per-component run and create-vs-provided decisions, and any pinned CAIRA ref for `reference` mode.

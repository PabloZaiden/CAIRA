# Reference Architecture Selection (Dynamic)

This template is for coding agents to decide using discovered CAIRA assets, not hardcoded architecture names.

## Discovery steps

1. Resolve `ref` (user-provided or latest release tag).
1. List architectures dynamically:
   - `GET https://api.github.com/repos/microsoft/CAIRA/contents/strategy-builder/infra/reference-architectures?ref=<ref>`
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

## Decision rubric (content-driven)

For each discovered architecture, score fit by user requirements:

- Networking/security fit
- Agent-capability/data-service fit
- Application integration fit
- Operational model fit (monitoring/compliance/enterprise controls)
- Complexity and maintainability fit

Treat capability-host connectivity, private networking, and extra projects as advanced requirements. If the user's needs are satisfied by the baseline sample, keep the recommendation anchored on the simpler default instead of copying those advanced additions.

Do not include `testing_overlay.tf`, `testing_variables.tf`, `testing_outputs.tf`, or related internal validation assets in the recommended architecture scope unless the user explicitly asks for testing or validation infrastructure.

Do not treat pirate-domain sample content as reusable business logic. Only reuse the architecture, composition, deployment, and observability patterns.

Pick highest fit score and provide alternatives.

## Output format

```text
Recommendation:
- selected: <architecture_name_from_discovery>
- reason: <short, evidence-based summary>

Alternatives:
- <architecture_name_from_discovery>: <tradeoff>
- <architecture_name_from_discovery>: <tradeoff>

Evidence URLs:
- <repo file URL>
- <repo file URL>
```

## Confirmation gate

Always require explicit user confirmation before generating or modifying files.

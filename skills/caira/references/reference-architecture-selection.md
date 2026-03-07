# Reference Architecture Selection (Dynamic)

This template is for coding agents to decide using discovered CAIRA assets, not hardcoded architecture names.

## Discovery steps

1. Resolve `ref` (user-provided or latest release tag).
1. List architectures dynamically:
   - `GET https://api.github.com/repos/microsoft/CAIRA/contents/infra/architectures?ref=<ref>`
1. For each discovered architecture directory:
   - List files in that directory via contents API.
   - Read `README.md` and `*.tf` from returned `download_url` values.
   - Extract capabilities from content (networking posture, dependencies, capability host patterns, required inputs, complexity, observability components).

## Decision rubric (content-driven)

For each discovered architecture, score fit by user requirements:

- Networking/security fit
- Agent-capability/data-service fit
- Application integration fit
- Operational model fit (monitoring/compliance/enterprise controls)
- Complexity and maintainability fit

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

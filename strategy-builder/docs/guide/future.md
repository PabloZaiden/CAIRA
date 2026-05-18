# Future Work

This document tracks the main follow-up themes for the strategy-builder area now that CAIRA is organized as a single product repository spanning macro reference architectures, application components, and generated deployment strategies.

## WS-8: Application-layer Infrastructure Hardening

**Status:** Baseline delivered, reliability and coverage improvements continue.

### Current state

- `deployment-strategies/<reference-architecture>/<name>/infra/` is generated from `components/iac/azure-container-apps/`.
- `task strategy:deploy -- deployment-strategies/<reference-architecture>/<name>` deploys one implementation of the layered CAIRA reference architecture.
- ACA images are built, pushed to ACR, and consumed with managed identity.
- Frontend ingress is exposed while API and agent services stay internal.
- Local Docker workflows use the `azcred` sidecar so `DefaultAzureCredential` works inside containers.

### Remaining focus

- Expand deployed validation coverage across the full committed strategy set.
- Keep strategy Terraform aligned with the latest layered reference architecture under `strategy-builder/infra/reference-architectures/` and the shared `strategy-builder/infra/modules/` contracts.
- Continue reliability hardening for long-running Azure operations and retry behavior.

## WS-9: Observability & Telemetry

**Status:** Not started.

Focus areas:

- shared OpenTelemetry configuration for agent, API, and frontend components
- Application Insights integration across local and deployed strategies
- validation for traces, metrics, and log correlation

## WS-10: Docker Compose & Local Development

**Status:** Complete and maintained.

The compose-based local workflow remains the fastest way to validate the full application layer without deploying to Azure. Ongoing work here should stay focused on keeping local validation representative of deployed behavior.

## WS-11: Deployment Strategy Generation

**Status:** Complete and maintained.

The generator produces the committed deployment strategies under `deployment-strategies/`. Each generated directory is a deployable end-to-end deliverable built from strategy-builder source plus the layered CAIRA reference architecture.

### Ongoing expectations

- Regenerate committed deployment strategies whenever generator inputs change.
- Keep drift validation passing.
- Ensure generated documentation and commands match the root Taskfile workflow.

## WS-12: Multi-Agent Scenarios

**Status:** Complete.

Future work in this area should extend scenario breadth without breaking the current validation story for local compose and deployed strategy smoke tests.

## WS-13: Security & Auth Patterns

**Status:** In progress through ongoing hardening.

Focus areas:

- stronger production-ready auth helpers and token validation coverage
- least-privilege RBAC review for deployed strategies
- validation that secrets do not leak through logs or generated artifacts

## WS-14: Documentation Alignment

**Status:** Ongoing.

Documentation should continue to emphasize:

- the single-repo CAIRA model
- Taskfile-first workflows
- fast PR checks vs nightly deployed lifecycle validation
- generated deployment strategies as committed output, not hand-edited source

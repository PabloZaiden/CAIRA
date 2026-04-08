# CAIRA work status

## Overall status

- **Phase:** Executing
- **Implementation:** In progress
- **Latest update:** The TypeScript side of API auth hardening is now implemented in the source component: inbound auth uses an Entra/JWKS validator, outbound agent auth no longer falls back to a fake shared token, and the package tests/typecheck pass. The task remains in progress because the C# API variant still needs the same treatment, and one generated TypeScript strategy API copy still needs its dependency sync corrected before its copied validation is clean.

## Progress tracker

| ID | Workstream | Status | Dependencies | Notes |
| --- | --- | --- | --- | --- |
| 1 | Inventory current state | Done | None | Initial discovery completed across the requested source components, strategy READMEs, security posture doc, agent-container guide, and CAIRA skill. |
| 2 | Design shared JWT validation pattern | Done | 1 | Chosen contract: Entra access tokens validated for signature, `exp`, issuer, audience, and optional caller client IDs; local mock/dev keeps an explicit auth bypass instead of trying to fake production token issuance. |
| 3 | Implement hardened auth in agent containers | Pending | 2 | Waiting for implementation phase. |
| 4 | Implement hardened auth in API containers | In progress | 2 | TypeScript source implementation is complete and validated. Remaining work: apply the same contract to the C# API, finish syncing the generated TypeScript strategy API copies cleanly, and then re-run their checks. |
| 4a | Implement hardened auth in the frontend BFF | Done | 2 | Replaced the static inter-service bearer with Entra token acquisition in `strategy-builder/components/frontend/react-typescript`, copied the same files into all three generated strategy frontends, and validated the source plus one generated strategy frontend with tests/typecheck. |
| 5 | Reframe the sample domain | Pending | 1 | Waiting for implementation phase. |
| 6 | Align MAF docs with implementation | Pending | 1, 5 | Waiting for implementation phase. |
| 7 | Strengthen production posture docs | Pending | 2, 3, 4 | Waiting for implementation phase. |
| 8 | Strengthen CAIRA partial-adoption guidance | Pending | 1, 7 | Waiting for implementation phase. |
| 9 | Propagate strategy and doc consistency | Pending | 3, 4, 5, 6, 7, 8 | Waiting for implementation phase. |
| 10 | Validate locally and on Azure | Pending | 9 | Waiting for implementation phase. |
| 11 | Execute accepted plan | Pending | 2, 3, 4, 5, 6, 7, 8, 9, 10 | Added from the latest user message to ensure the approved plan is executed end to end with incremental status updates after each task. |

## Current task

- **Task:** Implement hardened auth in API containers
- **State:** In progress
- **Key findings so far:**
  - `AGENTS.md` is not present in this worktree, so execution is following the accepted plan plus the repository conventions already in use.
  - The TypeScript API source package now validates inbound Entra access tokens against tenant-derived issuers, configured audiences, and optional caller app IDs via JWKS, and its outbound agent client now requires a real token provider instead of falling back to a shared static bearer.
  - The frontend BFF auth hop has been updated to acquire Entra tokens instead of injecting a static shared bearer.
  - The TypeScript API package now carries `jose`; the C# API project still needs Entra/JWKS validation packages and middleware changes.
  - The selected auth contract uses per-service audience configuration, tenant-derived issuer allowlists, JWKS-backed signature validation, and optional caller application-ID allowlists so the same model can be applied consistently to BFF -> API and API -> agent hops.
  - Two generated TypeScript strategy API copies were synced from the source component, but one copied validation run exposed a dependency-sync mismatch (`jose` missing in the copied install), so the strategy copy propagation still needs one cleanup pass after the C# API work.

## Immediate next step

Implement the same inbound/outbound auth contract in `strategy-builder/components/api/csharp`, update its tests to remove fallback-token expectations, then finish the TypeScript strategy API copy sync and re-run the copied validation.

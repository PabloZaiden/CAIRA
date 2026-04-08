# CAIRA work status

## Overall status

- **Phase:** Executing
- **Implementation:** In progress
- **Latest update:** The TypeScript auth foundation now covers the full BFF -> API -> agent chain in both source components and generated strategy copies. API auth is implemented across TypeScript and C# codepaths, but C# runtime verification is blocked here because `dotnet` is unavailable. Agent auth is now in progress: both TypeScript agent variants validate inbound Entra/JWKS tokens, their generated strategy copies are synced, targeted auth tests pass, and typecheck passes after adding the missing local `typescript` dev dependency.

## Progress tracker

| ID | Workstream | Status | Dependencies | Notes |
| --- | --- | --- | --- | --- |
| 1 | Inventory current state | Done | None | Initial discovery completed across the requested source components, strategy READMEs, security posture doc, agent-container guide, and CAIRA skill. |
| 2 | Design shared JWT validation pattern | Done | 1 | Chosen contract: Entra access tokens validated for signature, `exp`, issuer, audience, and optional caller client IDs; local mock/dev keeps an explicit auth bypass instead of trying to fake production token issuance. |
| 3 | Implement hardened auth in agent containers | In progress | 2 | TypeScript OpenAI Agent SDK and Foundry Agent Service variants now validate inbound Entra access tokens, and the same files were copied into both generated TypeScript strategy agents. Remaining work: implement/sync the C# Microsoft Agent Framework agent variant and verify it once a `dotnet` runtime is available. |
| 4 | Implement hardened auth in API containers | Blocked | 2 | TypeScript API source and both generated TypeScript strategy APIs now validate inbound Entra tokens and use real outbound token acquisition. The C# API source and MAF strategy copy were updated to the same contract, but runtime verification is blocked here because `dotnet` is not installed in this environment. |
| 4a | Implement hardened auth in the frontend BFF | Done | 2 | Replaced the static inter-service bearer with Entra token acquisition in `strategy-builder/components/frontend/react-typescript`, copied the same files into all three generated strategy frontends, and validated the source plus one generated strategy frontend with tests/typecheck. |
| 5 | Reframe the sample domain | Pending | 1 | Waiting for implementation phase. |
| 6 | Align MAF docs with implementation | Pending | 1, 5 | Waiting for implementation phase. |
| 7 | Strengthen production posture docs | Pending | 2, 3, 4 | Waiting for implementation phase. |
| 8 | Strengthen CAIRA partial-adoption guidance | Pending | 1, 7 | Waiting for implementation phase. |
| 9 | Propagate strategy and doc consistency | Pending | 3, 4, 5, 6, 7, 8 | Waiting for implementation phase. |
| 10 | Validate locally and on Azure | Pending | 9 | Waiting for implementation phase. |
| 11 | Execute accepted plan | Pending | 2, 3, 4, 5, 6, 7, 8, 9, 10 | Added from the latest user message to ensure the approved plan is executed end to end with incremental status updates after each task. |

## Current task

- **Task:** Implement hardened auth in agent containers
- **State:** In progress
- **Key findings so far:**
  - `AGENTS.md` is not present in this worktree, so execution is following the accepted plan plus the repository conventions already in use.
  - The frontend BFF auth hop now acquires Entra tokens instead of injecting a static shared bearer.
  - The TypeScript API source package and both generated TypeScript strategy APIs now validate inbound Entra access tokens against tenant-derived issuers, configured audiences, and optional caller app IDs via JWKS; the earlier copied-package `jose` mismatch was resolved by refreshing the generated installs after syncing package manifests and locks.
  - The C# API source and the MAF strategy API copy now carry the same Entra/JWKS validator and outbound token-provider contract, but they cannot be exercised here because `dotnet` is unavailable.
  - The TypeScript OpenAI Agent SDK and Foundry Agent Service source components now use the same inbound validator shape as the API layer, including `INBOUND_AUTH_TENANT_ID`, `INBOUND_AUTH_ALLOWED_AUDIENCES`, optional caller app IDs, and authority-host overrides.
  - Both TypeScript agent packages already had a `typecheck` script but no local `typescript` dependency, so `typescript` was added explicitly to make the existing validation path real instead of accidental.
  - The full-package agent test suites still contain unrelated pre-existing streaming-event failures in `openai-client.test.ts` and `foundry-client.test.ts`; targeted auth tests and typecheck are passing, so those older failures are not caused by the auth changes.

## Immediate next step

Implement the same inbound token-validation contract in `strategy-builder/components/agent/csharp/microsoft-agent-framework`, update its tests/docs where possible, and then move into the domain reframe plus MAF documentation alignment while the missing `dotnet` runtime continues to block C# execution checks.

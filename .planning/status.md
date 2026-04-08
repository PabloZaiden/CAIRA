# CAIRA work status

## Overall status

- **Phase:** Executing
- **Implementation:** In progress
- **Latest update:** The source-component domain reframe is now underway on the user-facing and prompt-bearing surfaces. The frontend now presents a sales/account-team experience, the API synthetic starters now open in the new fictional business domain, and the TypeScript/C# agent default prompts plus knowledge bases have been shifted away from pirate content. Both C# auth workstreams remain runtime-blocked in this environment because `dotnet` is unavailable, so the current execution focus is to finish propagating the reframe through strategy copies and docs.

## Progress tracker

| ID | Workstream | Status | Dependencies | Notes |
| --- | --- | --- | --- | --- |
| 1 | Inventory current state | Done | None | Initial discovery completed across the requested source components, strategy READMEs, security posture doc, agent-container guide, and CAIRA skill. |
| 2 | Design shared JWT validation pattern | Done | 1 | Chosen contract: Entra access tokens validated for signature, `exp`, issuer, audience, and optional caller client IDs; local mock/dev keeps an explicit auth bypass instead of trying to fake production token issuance. |
| 3 | Implement hardened auth in agent containers | Blocked | 2 | TypeScript OpenAI Agent SDK and Foundry Agent Service variants now validate inbound Entra access tokens, and the same files were copied into both generated TypeScript strategy agents. The C# Microsoft Agent Framework agent source and MAF strategy copy now carry the same validator/config contract, but runtime verification is blocked here because `dotnet` is not installed. |
| 4 | Implement hardened auth in API containers | Blocked | 2 | TypeScript API source and both generated TypeScript strategy APIs now validate inbound Entra tokens and use real outbound token acquisition. The C# API source and MAF strategy copy were updated to the same contract, but runtime verification is blocked here because `dotnet` is not installed in this environment. |
| 4a | Implement hardened auth in the frontend BFF | Done | 2 | Replaced the static inter-service bearer with Entra token acquisition in `strategy-builder/components/frontend/react-typescript`, copied the same files into all three generated strategy frontends, and validated the source plus one generated strategy frontend with tests/typecheck. |
| 5 | Reframe the sample domain | In progress | 1 | The source frontend, API starter prompts, and source-agent default prompts/knowledge bases now use a fictional sales/account-team framing while preserving the current HTTP contract. Those source changes have also been synced into the generated TypeScript OpenAI strategy and the shared strategy frontends/API surfaces. Remaining work is deeper tool metadata, the remaining strategy-copy surfaces, and docs. |
| 6 | Align MAF docs with implementation | Pending | 1, 5 | Waiting for the domain reframe so the docs only need one honest rewrite. |
| 7 | Strengthen production posture docs | Pending | 2, 3, 4 | Waiting for implementation phase. |
| 8 | Strengthen CAIRA partial-adoption guidance | Pending | 1, 7 | Waiting for implementation phase. |
| 9 | Propagate strategy and doc consistency | Pending | 3, 4, 5, 6, 7, 8 | Waiting for implementation phase. |
| 10 | Validate locally and on Azure | Pending | 9 | Waiting for implementation phase. |
| 11 | Execute accepted plan | Pending | 2, 3, 4, 5, 6, 7, 8, 9, 10 | Added from the latest user message to ensure the approved plan is executed end to end with incremental status updates after each task. |

## Current task

- **Task:** Reframe the sample domain
- **State:** In progress
- **Key findings so far:**
  - `AGENTS.md` is not present in this worktree, so execution is following the accepted plan plus the repository conventions already in use.
  - The frontend BFF auth hop now acquires Entra tokens instead of injecting a static shared bearer.
  - The TypeScript API source package and both generated TypeScript strategy APIs now validate inbound Entra access tokens against tenant-derived issuers, configured audiences, and optional caller app IDs via JWKS; the earlier copied-package `jose` mismatch was resolved by refreshing the generated installs after syncing package manifests and locks.
  - The C# API source and the MAF strategy API copy now carry the same Entra/JWKS validator and outbound token-provider contract, but they cannot be exercised here because `dotnet` is unavailable.
  - The TypeScript OpenAI Agent SDK and Foundry Agent Service source components now use the same inbound validator shape as the API layer, including `INBOUND_AUTH_TENANT_ID`, `INBOUND_AUTH_ALLOWED_AUDIENCES`, optional caller app IDs, and authority-host overrides.
  - Both TypeScript agent packages already had a `typecheck` script but no local `typescript` dependency, so `typescript` was added explicitly to make the existing validation path real instead of accidental.
  - The C# Microsoft Agent Framework agent now mirrors the same inbound auth surface (`INBOUND_AUTH_TENANT_ID`, accepted audiences, optional caller app IDs, authority-host override) and rejects invalid bearer tokens instead of only checking for header presence; the generated MAF strategy agent copy has been synced to the same code.
  - The full-package agent test suites still contain unrelated pre-existing streaming-event failures in `openai-client.test.ts` and `foundry-client.test.ts`; targeted auth tests and typecheck are passing, so those older failures are not caused by the auth changes.
  - The source frontend now uses user-facing labels like Opportunity Discovery, Account Planning, and Team Staffing; it also remaps legacy resolution field names into business-friendly labels so the sample can move domains without breaking the current API contract.
  - The TypeScript and C# source agents now default to a fictional sales/account-team scenario in their top-level prompts and local knowledge bases, but some deeper tool metadata, strategy-copy files, and docs still carry pirate wording and need a follow-on sync.
  - The TypeScript source API and C# source API now seed new conversations with sales/account-team synthetic messages instead of pirate starters.
  - The generated TypeScript OpenAI strategy now carries the same reframe on the frontend, API route starters, and agent config/knowledge surfaces; focused generated-package validation passed for its frontend, API, and agent config tests.
  - Focused validation for this slice passed in the source packages that are runnable here: frontend `App` and API client tests, TypeScript OpenAI agent config tests, TypeScript Foundry agent config tests, and TypeScript API route tests.
  - The repository still carries pirate-specific type names, client names, generated strategy copy, and documentation across all three framework variants, so the domain reframe must continue as a coordinated compatibility-preserving pass rather than a one-shot rename.

## Immediate next step

Continue the domain reframe by updating deeper agent/tool metadata and the remaining strategy-copy surfaces, then move directly into the MAF/component guidance and security/skill docs so they describe the real implementation and the new sample framing without reintroducing pirate terminology.

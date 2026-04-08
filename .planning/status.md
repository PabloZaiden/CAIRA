# CAIRA work status

## Overall status

- **Phase:** Executing
- **Implementation:** In progress
- **Latest update:** The missing shared compose helper has now been restored, so the original script-path blocker is cleared. Re-running `task strategy:validate:pr` immediately exposed the next repo-level blocker instead: the strategy scripts also import a missing generator library tree under `strategy-builder/scripts/lib/generator/`, so repo-level regeneration and drift validation still cannot run end to end from this checkout.

## Progress tracker

| ID | Workstream | Status | Dependencies | Notes |
| --- | --- | --- | --- | --- |
| 1 | Inventory current state | Done | None | Initial discovery completed across the requested source components, strategy READMEs, security posture doc, agent-container guide, and CAIRA skill. |
| 2 | Design shared JWT validation pattern | Done | 1 | Chosen contract: Entra access tokens validated for signature, `exp`, issuer, audience, and optional caller client IDs; local mock/dev keeps an explicit auth bypass instead of trying to fake production token issuance. |
| 3 | Implement hardened auth in agent containers | Done | 2 | TypeScript OpenAI Agent SDK and Foundry Agent Service variants now validate inbound Entra access tokens, and the same files were copied into both generated TypeScript strategy agents. The C# Microsoft Agent Framework agent source and MAF strategy copy carry the same validator/config contract, and the source C# agent test suite now passes under `dotnet test`. |
| 4 | Implement hardened auth in API containers | Done | 2 | TypeScript API source and both generated TypeScript strategy APIs now validate inbound Entra tokens and use real outbound token acquisition. The C# API source and MAF strategy copy were updated to the same contract, and the source C# API test suite now passes under `dotnet test`. |
| 4a | Implement hardened auth in the frontend BFF | Done | 2 | Replaced the static inter-service bearer with Entra token acquisition in `strategy-builder/components/frontend/react-typescript`, copied the same files into all three generated strategy frontends, and validated the source plus one generated strategy frontend with tests/typecheck. |
| 5 | Reframe the sample domain | Done | 1 | The source frontend, API starter prompts, source-agent prompts/knowledge bases, strategy copies, and high-signal docs now use the fictional sales/account-team framing while preserving the existing HTTP contract. The remaining pirate-shaped identifiers are intentional compatibility-preserved internals, not unfinished user-facing sample content. |
| 6 | Align MAF docs with implementation | Done | 1, 5 | Updated `strategy-builder/docs/guide/components/agent-containers.md` and the C# MAF deployment-strategy README to state the real architecture: workflow-per-mode selected by metadata, no separate captain/triage runtime agent, and shared `CAPTAIN_INSTRUCTIONS` used only as a prompt block. Also aligned C# workflow/tool descriptions with the sales/account-team sample domain and synced the strategy copy. |
| 7 | Strengthen production posture docs | Done | 2, 3, 4 | Updated `docs/security_posture.md` to spell out the current security baseline, Entra service-to-service token validation, local-vs-Azure behavior, sample limits, and production gaps. Updated all three `foundry_agentic_app` strategy READMEs with explicit internal identity/audience guidance, `SKIP_AUTH` positioning, and a clearer production-posture section. |
| 8 | Strengthen CAIRA partial-adoption guidance | Done | 1, 7 | Rewrote `skills/caira/SKILL.md` to make slice-based adoption first-class: minimal intake, component intake matrix, copy-vs-reference rules, reuse-first guidance for user-owned assets, provenance rules, and concrete flows for agent-only, observability-only, and existing-hosting scenarios. |
| 9 | Propagate strategy and doc consistency | Done | 3, 4, 5, 6, 7, 8 | Completed the highest-signal consistency pass across component guides, secondary guide pages, skill reference notes, and strategy docs. The remaining pirate-shaped identifiers are now intentional compatibility-preserved internals rather than undocumented drift. |
| 10 | Validate locally and on Azure | Blocked | 9 | Focused source and generated-strategy validation has expanded: both generated TypeScript strategies now have passing targeted frontend/API/agent tests, and both source C# test suites pass. Azure CLI login is present. The previously missing `strategy-builder/scripts/lib/compose-helpers.ts` helper is now restored, but repo-level strategy validation is still blocked because the scripts also import a missing generator library tree under `strategy-builder/scripts/lib/generator/`, which causes `task strategy:validate:pr` to fail before regeneration, drift validation, or deeper local/Azure strategy execution can run. |
| 11 | Execute accepted plan | Pending | 2, 3, 4, 5, 6, 7, 8, 9, 10 | Added from the latest user message to ensure the approved plan is executed end to end with incremental status updates after each task. |

## Current task

- **Task:** Validate locally and on Azure
- **State:** Blocked on missing generator library
- **Key findings so far:**
  - `AGENTS.md` is not present in this worktree, so execution is following the accepted plan plus the repository conventions already in use.
  - The frontend BFF auth hop now acquires Entra tokens instead of injecting a static shared bearer.
  - The TypeScript API source package and both generated TypeScript strategy APIs now validate inbound Entra access tokens against tenant-derived issuers, configured audiences, and optional caller app IDs via JWKS; the earlier copied-package `jose` mismatch was resolved by refreshing the generated installs after syncing package manifests and locks.
  - The C# API source and the MAF strategy API copy now carry the same Entra/JWKS validator and outbound token-provider contract, and the source C# API test suite now passes under `dotnet test`.
  - The TypeScript OpenAI Agent SDK and Foundry Agent Service source components now use the same inbound validator shape as the API layer, including `INBOUND_AUTH_TENANT_ID`, `INBOUND_AUTH_ALLOWED_AUDIENCES`, optional caller app IDs, and authority-host overrides.
  - Both TypeScript agent packages already had a `typecheck` script but no local `typescript` dependency, so `typescript` was added explicitly to make the existing validation path real instead of accidental.
  - The C# Microsoft Agent Framework agent now mirrors the same inbound auth surface (`INBOUND_AUTH_TENANT_ID`, accepted audiences, optional caller app IDs, authority-host override) and rejects invalid bearer tokens instead of only checking for header presence; the generated MAF strategy agent copy has been synced to the same code, and the source C# agent test suite now passes under `dotnet test`.
  - The full-package agent test suites still contain unrelated pre-existing streaming-event failures in `openai-client.test.ts` and `foundry-client.test.ts`; targeted auth tests and typecheck are passing, so those older failures are not caused by the auth changes.
  - The source frontend now uses user-facing labels like Opportunity Discovery, Account Planning, and Team Staffing; it also remaps legacy resolution field names into business-friendly labels so the sample can move domains without breaking the current API contract.
  - The TypeScript and C# source agents now default to a fictional sales/account-team scenario in their top-level prompts and local knowledge bases; the remaining pirate-shaped identifiers are intentional compatibility-preserved internals rather than unfinished user-facing sample content.
  - The TypeScript source API and C# source API now seed new conversations with sales/account-team synthetic messages instead of pirate starters.
  - The generated TypeScript OpenAI strategy now carries the same reframe on the frontend, API route starters, and agent config/knowledge surfaces; focused generated-package validation passed for its frontend, API, and agent config tests.
  - Focused validation for this slice passed in the source packages that are runnable here: frontend `App` and API client tests, TypeScript OpenAI agent config tests, TypeScript Foundry agent config tests, and TypeScript API route tests.
  - The repository still carries pirate-shaped type names, client names, route IDs, and generated strategy internals for compatibility, but the user-facing sample framing and documentation have been moved to the fictional sales/account-team domain across all three framework variants.
  - The MAF documentation gap is now closed in the component guide and the C# deployment-strategy README: the docs explicitly say the C# runtime uses metadata-driven workflow selection, not the same captain/triage orchestration as the TypeScript variants.
  - The production-posture docs now explicitly distinguish local development, local validation, sample Azure deployment, and real production, and they document the actual internal auth baseline now present in the samples.
  - The CAIRA skill now matches the repository's real selective-adoption posture much more closely: it explicitly guides agents to perform minimal intake, reuse existing assets, choose copy vs reference mode, and explain provenance instead of copying whole deployment strategies by default.
  - The highest-signal remaining naming drift has been cleared from the secondary guide docs; the remaining pirate-shaped internal names are now intentionally preserved for contract compatibility rather than undocumented doc drift.
  - The generated TypeScript Foundry strategy now also has passing focused frontend/API/agent validation after refreshing its frontend dependencies locally.
  - Azure CLI login is present in this session, so Azure access itself is not the current blocker.
  - The missing shared compose helper module has been restored at `strategy-builder/scripts/lib/compose-helpers.ts`, and it now loads successfully.
  - Re-running `task strategy:validate:pr` now fails later in the startup path because `compose-test-runner.ts`, `generate-strategies.ts`, `identity-test-runner.ts`, `test-all.ts`, and `validate-strategies.ts` import files under `strategy-builder/scripts/lib/generator/`, but that entire library tree is absent from this checkout.
  - `git ls-tree` confirms the missing generator-library path is not just a local untracked-file issue: there are no tracked files under `strategy-builder/scripts/lib/generator/` in the current worktree.
  - `git log --all -- strategy-builder/scripts/lib/generator` also returns no history in this checkout, so the missing generator-library tree does not appear to be recoverable here as a recently deleted tracked directory.

## Immediate next step

Determine whether the generator-library tree can be restored from another canonical source in the repo history or environment. If it cannot, keep the repo status explicit that end-to-end strategy regeneration and validation remain blocked by missing first-party tooling rather than by the auth or domain changes made in this workstream.

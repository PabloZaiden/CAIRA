# CAIRA repository improvement plan

## Objectives

1. Replace placeholder bearer-token checks with real Entra ID / Azure AD JWT validation across the affected API and agent variants, while keeping the current HTTP contracts stable.
2. Raise the repository's public-sample quality by making the production posture explicit: what is already covered, what is sample-only, and what still belongs to downstream production hardening.
3. Align the Microsoft Agent Framework documentation with the code that actually exists today, especially where the C# variant uses workflow-per-mode execution rather than the exact orchestration pattern used by the other variants.
4. Make CAIRA easier to consume by slices by strengthening `skills/caira/SKILL.md` and supporting docs around intake, partial adoption, copy vs reference mode, and reuse of existing user-owned assets.
5. Reframe the sample from a pirate scenario to a fictional sales / account-team domain without changing the core mechanics: three modes, differentiated specialists, knowledge tools, structured resolution, streaming, and multi-turn continuity.
6. Finish with full validation of the supported strategies locally and on Azure, including endpoint exercise and documentation of any precise remaining sample limits.

## Current-state observations informing the work

- The TypeScript agent variants and both API variants currently gate protected endpoints by checking only for a non-empty `Authorization: Bearer ...` header.
- The C# Microsoft Agent Framework implementation already routes by `metadata.mode` into distinct specialist workflows; it does not currently implement the same captain/triage pattern described for the other agent variants.
- Pirate-specific naming appears in prompts, route names, synthetic starter messages, knowledge-base content, type names, comments, and strategy documentation, so the domain reframe must be broad rather than cosmetic.
- Deployment strategy READMEs already explain local credential flow and Azure deployment flow, but they do not yet describe hardened service-to-service auth expectations or a precise production posture.
- The CAIRA skill already gestures at slice-based adoption, but it needs tighter intake guidance, component-level decision paths, and clearer provenance/backing from repository documentation.

## Planned work

| ID | Task | Description | Dependencies | Complexity |
| --- | --- | --- | --- | --- |
| 1 | Inventory current state | Confirm every affected auth gate, domain-specific asset, MAF implementation seam, strategy README, and skill/doc surface so later edits stay consistent across generated strategies and source components. | None | Medium |
| 2 | Design shared JWT validation pattern | Define one repository-wide auth pattern for internal service-to-service traffic: required claims, issuer format, audience mapping, JWKS/signature validation approach, configuration surface, local mock/dev behavior, and exact sample limits. | 1 | High |
| 3 | Implement hardened auth in agent containers | Add real JWT validation to `strategy-builder/components/agent/typescript/openai-agent-sdk`, `strategy-builder/components/agent/typescript/foundry-agent-service`, and `strategy-builder/components/agent/csharp/microsoft-agent-framework`, then update the generated deployment strategies that embed those components. | 2 | High |
| 4 | Implement hardened auth in API containers | Apply the same validation posture to `strategy-builder/components/api/typescript` and `strategy-builder/components/api/csharp`, keeping downstream contract behavior stable while documenting which caller identity each service expects. | 2 | High |
| 4a | Implement hardened auth in the frontend BFF | Replace the frontend static inter-service bearer token flow with real Entra token acquisition for BFF-to-API calls, keeping local mock/dev behavior explicit and aligned with the same validation contract used by the API and agent containers. | 2 | High |
| 5 | Reframe the sample domain | Replace the pirate sample with a fictional sales / account-team domain. Working mapping candidate: `shanty -> discovery/qualification`, `treasure -> account planning/engagement`, `crew -> proposal/deal progression`; confirm the best fit, then propagate names, prompts, knowledge content, comments, and UX text consistently. | 1 | High |
| 6 | Align MAF docs with implementation | Update docs so the C# variant is described honestly as workflow-per-mode selected by metadata, explain where it is conceptually equivalent to the other variants, and clearly state where it does not have a real captain/triage agent. Include small code improvements only if they materially reduce the doc/code gap without redesigning the architecture. | 1, 5 | Medium |
| 7 | Strengthen production posture docs | Update `docs/security_posture.md`, strategy READMEs, and any adjacent guidance so an external reader can distinguish baseline coverage from production hardening work, and understand the differences between local dev, sample validation, sample Azure deployment, and real production. | 2, 3, 4 | Medium |
| 8 | Strengthen CAIRA partial-adoption guidance | Rewrite `skills/caira/SKILL.md` and any supporting repository docs to make slice-based adoption first-class: minimal intake, existing-asset detection, copy vs reference mode, provenance of recommended assets, and component-by-component decisions for frontend, API, agent container, capability host, observability, APIM/AI gateway, and private networking. | 1, 7 | Medium |
| 9 | Propagate strategy and doc consistency | Update the deployment strategies under `deployment-strategies/foundry_agentic_app/*`, component guides such as `strategy-builder/docs/guide/components/agent-containers.md`, and any linked contract/provenance docs so auth guidance, domain naming, and framework descriptions stay aligned everywhere. | 3, 4, 5, 6, 7, 8 | High |
| 10 | Validate locally and on Azure | Run the repo's existing tests plus strategy-specific local and Azure validation flows for all targeted strategies, exercise the endpoints, and record any precise residual limitations that remain sample-only after the implementation work. | 9 | High |

## Step-by-step execution detail

### 1. Inventory current state

- Inspect the listed source components and strategy outputs to enumerate:
  - auth entry points and current middleware/hooks
  - generated strategy copies that must be updated alongside source components
  - MAF implementation details that differ from current docs
  - all user-facing pirate-domain assets that must move together
  - repository docs that currently describe security, identity, deployment posture, and partial adoption
- Produce the working list of files to touch so the implementation stays comprehensive.

### 2. Design the shared JWT validation pattern

- Choose a repo-wide internal auth pattern for service-to-service traffic based on Entra-issued JWT access tokens.
- Define the minimum validation set:
  - signature validation through JWKS or platform-provided validator support
  - `exp`
  - `iss`
  - `aud`
  - caller identity claims used for service-principal or managed-identity traffic where appropriate
- Decide the configuration contract for TypeScript and C#:
  - tenant/issuer inputs
  - accepted audiences
  - optional accepted client/application IDs if needed for stricter service-to-service validation
  - explicit `SKIP_AUTH` behavior for local mock/test mode only
- Document how local compose/mocks differ from Azure Container Apps deployment and which paths remain intentionally sample-scoped.

### 3. Implement hardened auth in the agent containers

- Replace placeholder bearer checks with real token validation in:
  - `strategy-builder/components/agent/typescript/openai-agent-sdk`
  - `strategy-builder/components/agent/typescript/foundry-agent-service`
  - `strategy-builder/components/agent/csharp/microsoft-agent-framework`
- Add or update tests covering:
  - missing header
  - malformed token
  - expired token
  - invalid issuer
  - invalid audience
  - signature/JWKS validation failures
  - expected success path for valid service-to-service tokens
  - `SKIP_AUTH=true` local/test behavior
- Update component manifests/config samples as needed so the new validation inputs flow through generated strategies.

### 4. Implement hardened auth in the API containers

- Apply the same JWT validation posture to:
  - `strategy-builder/components/api/typescript`
  - `strategy-builder/components/api/csharp`
- Ensure the API-to-agent call chain and the frontend/BFF-to-API expectations remain coherent.
- Keep the public HTTP contract stable unless a change is required to support correct auth semantics.
- Add/update tests for all relevant auth failure/success cases.

### 4a. Implement hardened auth in the frontend BFF

- Replace the static `INTER_SERVICE_TOKEN` proxy behavior in `strategy-builder/components/frontend/react-typescript` with real token acquisition for BFF-to-API requests.
- Align the BFF configuration contract with the repository-wide auth design so it can request the API audience in Azure deployments and remain explicit about local-development bypass behavior.
- Update tests and generated strategy copies so the BFF, API, and agent hops all follow the same service-to-service story.

### 5. Reframe the sample domain

- Define the final enterprise-neutral mapping for the three activity modes and specialists.
- Update the sample across:
  - prompts and shared instructions
  - knowledge-base/tool content
  - starter messages
  - route labels, type names, and comments where they are externally meaningful
  - frontend copy and user-facing strings
  - strategy READMEs and guide docs
- Preserve the mechanics:
  - three modes/activities
  - differentiated specialists
  - knowledge tools
  - structured resolution tools
  - streaming and multi-turn continuity

### 6. Align MAF docs with implementation

- Update `strategy-builder/docs/guide/components/agent-containers.md` and the C# strategy README to explain:
  - metadata-driven workflow selection by mode
  - the absence of a true captain/triage agent in the current C# implementation
  - conceptual similarities to the other variants
  - the exact differences in orchestration pattern and event flow
- Review whether a small naming/comment cleanup in the C# code materially improves clarity without changing architecture.

### 7. Strengthen production posture docs

- Update `docs/security_posture.md` to separate:
  - baseline already included by CAIRA
  - stronger recommendations embodied by these samples
  - what users still need for real production
  - the limits of the sample
- Update strategy READMEs with explicit guidance for:
  - expected identities and audiences
  - local dev vs Azure deployment auth behavior
  - sample deployment vs production posture
  - observability and gateway coverage already present

### 8. Strengthen CAIRA partial-adoption guidance

- Expand `skills/caira/SKILL.md` with:
  - a minimal but sufficient intake sequence
  - stronger copy-vs-reference guidance
  - detection rules for existing user assets
  - slice selection rules that avoid pulling in whole bundles unnecessarily
  - component-level guidance for frontend, API, agent container, capability host, observability, APIM/AI gateway, and private networking
  - provenance language that explains where each recommended asset came from
- Add concrete usage flows, including:
  - agent-only + existing Foundry
  - observability hookup only
  - existing hosting + new agent

### 9. Propagate strategy and doc consistency

- Update all three deployment strategy READMEs so they tell the same truth about:
  - auth and service identities
  - local versus Azure behavior
  - APIM/gateway scope
  - sample domain
  - MAF differences where relevant
- Review supporting docs, contracts, manifests, and generated copies for stale naming or stale auth guidance.

### 10. Validate locally and on Azure

- Run the repository's existing component tests first to catch regressions.
- For each affected deployment strategy:
  - run the supported local workflow
  - exercise health, identity/auth, and conversation endpoints
  - verify the sales/account-team flows still resolve correctly
- Run the supported Azure deployment/validation flow for each strategy and exercise the deployed endpoints.
- Capture any residual sample-only limits precisely in the updated docs if a gap cannot be closed in-code.

## Dependency summary

- Tasks 3 and 4 depend on task 2 because the repository needs one coherent JWT validation story before code is changed in multiple languages.
- Task 4a also depends on task 2 because the BFF currently injects a static bearer token and must be brought onto the same Entra-based contract as the API and agent containers.
- Task 5 can proceed once the inventory is complete, but its outputs must be reflected in tasks 6, 7, 8, and 9.
- Task 6 depends on the inventory and benefits from the domain reframe so the docs are not rewritten twice.
- Tasks 7 and 8 depend on having the auth shape and core repo positioning settled.
- Task 9 is the repository-wide consolidation pass and should happen after the main implementation and documentation workstreams.
- Task 10 is the final gate and depends on the consistency pass being complete.

## Risks and considerations

- Auth changes touch multiple languages and generated strategy copies, so drift between source components and deployment strategies is a primary risk.
- The domain reframe will likely require broad string and type updates; care is needed to preserve contracts and sample behavior.
- The MAF docs must be corrected without overstating equivalence or understating useful similarities.
- Full Azure validation depends on the repository's existing deploy/validation flows and on a usable Azure environment at execution time; if an environment-side blocker appears, it should be documented precisely rather than hand-waved.

## Resumed execution plan for the current permission window

1. Reconfirm the live Azure validation entrypoints, deployment-strategy inventory, and any repo-side guidance that must be updated while the remaining validation work runs.
2. Re-run the OpenAI Agent SDK ACA validation in Azure first, because it already passed the deepest repo-side implementation checkpoints and is the fastest way to prove whether the newly granted tenant permissions unblock end-to-end auth.
3. If the OpenAI lane succeeds, run the same deployed validation and endpoint exercise for the Foundry Agent Service ACA strategy and then the C# Microsoft Agent Framework ACA strategy.
4. After each validation task, immediately update `.planning/status.md` with the exact outcome, any new blockers, and the next resume point so progress is preserved mid-iteration.
5. At the end of the window, update the repository docs that describe production posture or validation limits if the live Azure results changed the documented boundary, then bring `.planning/status.md` to a fully current end-of-iteration state.

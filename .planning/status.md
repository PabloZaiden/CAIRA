# CAIRA work status

## Overall status

- **Phase:** Blocked
- **Implementation:** Repository changes complete; public Azure validation now passes for all three ACA strategies, and the only remaining validation gap is the Docker-dependent local container/compose lane that this environment cannot run
- **Latest update:** This follow-up unattended iteration was recorded at the start of the session per instruction. The most important remaining task is re-checking the local validation blocker after the successful Azure reruns and persisting the result immediately in this file.
- **Latest update:** The local-validation blocker has materially changed in this session: Docker is now present in the environment (`/usr/bin/docker`, Docker 29.2.1), so the next action is to rerun the existing local validation lane instead of treating `L4`/`L5` as environment-blocked by default.
- **Latest update:** The public Azure validation lane is now green for all three ACA strategies:
  - `typescript-openai-agent-sdk-aca`: passed deployed validation, frontend `/health/deep` healthy, deployment kept
  - `typescript-foundry-agent-service-aca`: passed deployed validation, frontend `/health/deep` healthy, deployment kept
  - `csharp-microsoft-agent-framework-aca`: passed deployed validation after fixing the C# OpenTelemetry startup crash, frontend `/health/deep` healthy, deployment kept
- **Latest update:** The key repo-side fixes proven by the successful Azure reruns were:
  - replace the brittle `api://<client-id>` auth-resource wiring with stable App ID URIs declared directly on the Entra application objects across the shared ACA IaC, reference architecture, and generated strategy copies
  - fix the C# API and agent OpenTelemetry registration pattern so Azure Monitor tracing is configured before the service provider is built
- **Latest update:** The local validation lane was rerun in this iteration after the successful Azure work. `task strategy:test:local` now passes all non-Docker layers (`L1`, `L2`, `L3`, `L7`, `L8`), but `L4` container builds and `L5` compose/E2E are still skipped because the Docker CLI cannot reach the daemon in this session: `permission denied while trying to connect to the docker API at unix:///var/run/docker.sock`.
- **Latest update:** All repository-side work requested in the plan is complete: hardened Entra auth is implemented across the affected TypeScript and C# stacks, production-posture and troubleshooting docs are aligned with the real implementation, MAF documentation reflects the real workflow-per-mode architecture, the CAIRA skill supports partial adoption by slices, and the sample domain is reframed to the fictional sales/account-team scenario. Local validation is green, and the OpenAI ACA strategy now reaches healthy hardened revisions in Azure. The only remaining gap is external to the repo: this tenant cannot create the required Entra service principals and app-role assignments, so end-to-end Azure token acquisition stops at `403 Authorization_RequestDenied` / `AADSTS500011`.
- **Latest update:** The Azure auth-env blocker is now implemented in the reference-architecture and deploy pipeline. The macro Terraform now provisions Entra application registrations, identifier URIs, application roles, and app-role assignments for the frontend->API and API->agent hops, and it exports the resulting tenant/scope/audience/caller metadata. `deploy-reference-architecture.ts` now writes namespaced auth values into the shared strategy `.env`, `deploy-strategy-azure.ts` now maps those values into the correct per-service runtime env vars, and `task strategy:validate:pr` is green again after the wiring change. The next step is live Azure validation of the OpenAI strategy to prove the containers start with the new auth contract and the deployed endpoints can be exercised end to end.
- **Latest update:** The Azure auth work is now on its third, much narrower rerun. The deploy path now creates real Entra application objects for the API and agent audiences, and the most recent public OpenAI rerun proved that those app registrations are being created in Azure under the strategy-local ACA infra. That rerun also exposed the next refinement: phase 1 does not need identifier-URI/service-principal/app-role-binding completion to synthesize scopes and audiences, so the auth Terraform was split so phase 1 can emit deterministic `api://<client-id>` values from the application objects alone, while phase 2 handles the slower service-principal/app-role-assignment work. `task strategy:validate:pr` is green again after that change. The current state is cleanup of the interrupted public OpenAI rerun so the next session can immediately rerun the same strategy from a clean workspace and verify the auth env contract end to end.
- **Latest update:** The next clean public Azure rerun is now past the key auth threshold. Phase 1 successfully emitted the expected auth outputs from Entra app `client_id` values:
  - `api_token_scope=api://e8931939-37f7-4448-b1d7-ab7ccfa861ba/.default`
  - `agent_token_scope=api://5fc6b91d-380e-44b9-886b-e75d12f0e5ec/.default`
  - API and agent allowed-audience arrays were populated with both bare `client_id` and `api://<client_id>` forms
  - caller-app allowlists are correctly empty during phase 1 because they are now phase-2-only
  The bootstrap apps are up in `rg-typescript-openai-agent-sdk-aca-public-g0782`, and the first ACR build (`dt1` for the agent image in registry `cairab35900e798e9k2qx0x`) is running. The remaining work is to let phase 2 complete, confirm the deployed revisions pick up the auth env vars, and then exercise the endpoints.

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
| 10 | Validate locally and on Azure | Blocked | 9 | Azure validation is complete for all three ACA strategies: OpenAI, Foundry Agent Service, and Microsoft Agent Framework all passed their public deployed validation suites, and all three frontends now return healthy `/health/deep` responses after the auth/telemetry fixes. The local validation lane was rerun after those fixes and passed every non-Docker layer, but `L4` container builds and `L5` compose/E2E still skip because the Docker daemon is not reachable from this session (`permission denied` on `/var/run/docker.sock`). |
| 11 | Execute accepted plan | Blocked | 2, 3, 4, 5, 6, 7, 8, 9, 10 | The implementation work is complete and persisted, and the Azure validation objective is satisfied. Execution remains blocked only by the Docker-daemon permission issue that prevents the last local container/compose layers from running. |
| 12 | Resume permission-window validation | Done | 10, 11 | Completed during the prior iteration: planning refreshed, OpenAI/Foundry/MAF ACA Azure lanes rerun, the shared auth IaC defect fixed, the C# telemetry startup defect fixed, and end-of-iteration status captured. |
| 13 | Resume post-Azure iteration | Done | 10, 11, 12 | Completed during this iteration: the saved status was refreshed, Docker access was rechecked, the local validation lane was rerun, and the remaining Docker-daemon permission blocker was captured precisely in this file. |

## Current task

- **Task:** Persist final blocker state
- **State:** Done for this iteration; all repo-side work is complete and the only remaining gap is the Docker-daemon permission blocker for local `L4`/`L5`
- **Key findings so far:**
  - This iteration was explicitly resumed after the user granted the required permissions for the next four hours, so the current priority is live Azure validation rather than further repository-side implementation.
  - Direct Azure CLI checks in this permission window now succeed for the OpenAI strategy's previously missing Entra service principals:
    - API auth service principal created for app ID `e8931939-37f7-4448-b1d7-ab7ccfa861ba`
    - agent auth service principal created for app ID `5fc6b91d-380e-44b9-886b-e75d12f0e5ec`
  - The first resumed deployed-test wrapper was stopped after those service principals were created because the wrapped Terraform/apply process was no longer emitting actionable progress and the app-role assignments were still empty.
  - Live OpenAI endpoint exercise on the fresh `--0000008` revisions still returned `AADSTS500011` for `api://e8931939-37f7-4448-b1d7-ab7ccfa861ba`, which narrowed the remaining issue to the Entra app registration itself rather than only to the missing service principal.
  - Direct Azure CLI inspection confirmed the root cause: both auth applications had empty `identifierUris`, even though the IaC outputs already advertised `api://<client-id>` scopes and allowed audiences.
  - The first Terraform-only attempt to bolt on `api://<client-id>` via `azuread_application_identifier_uri` was not enough: Terraform state showed the child resources, but Microsoft Graph still reported empty `identifierUris`, and the live `/api/health/deep` failure remained.
  - The auth IaC has now been simplified to the more reliable contract: each auth application declares a stable App ID URI directly on the application object itself (`api://<strategy-prefix>-api-auth` and `api://<strategy-prefix>-agent-auth`), and all generated token scopes plus accepted-audience outputs use those URIs consistently.
  - `task strategy:validate:pr` is green again after the stable-App-ID-URI change, including generator drift validation and Terraform validation for the reference architecture plus all three generated strategies.
  - The OpenAI strategy Terraform state already tracked the auth applications but not the service principals/app-role assignments, because the earlier deploys failed before those resources were created. The stale OpenAI auth service principals were deleted again after the stable-App-ID-URI change so the next rerun recreates them from the corrected application definition instead of from the earlier broken state.
  - The corrected OpenAI ACA rerun is now fully successful:
    - the frontend runtime env now carries `API_TOKEN_SCOPE=api://typescript-open-k2qx0x-api-auth/.default`
    - the API auth service principal now advertises both `api://typescript-open-k2qx0x-api-auth` and the client ID as service-principal names
    - the frontend `/health/deep` endpoint returns `healthy` with healthy API and agent auth dependencies
    - the deployed public-profile E2E suite passed (`75` tests passed, `3` skipped) against the live OpenAI ACA deployment and the deployment was intentionally kept for inspection
  - The Foundry ACA rerun is now also fully successful on the same auth shape:
    - the frontend runtime env carries `API_TOKEN_SCOPE=api://typescript-foun-b942ug-api-auth/.default`
    - the API and agent auth service principals advertise the expected stable App ID URIs
    - the frontend `/health/deep` endpoint returns `healthy` with healthy API and agent auth dependencies
    - the deployed public-profile E2E suite passed (`75` tests passed, `3` skipped) against the live Foundry ACA deployment and the deployment was intentionally kept for inspection
  - The MAF ACA rerun is now also fully successful after the C# telemetry fix:
    - the API no longer crashes at startup with `System.NotSupportedException: Services cannot be configured after ServiceProvider has been created.`
    - the frontend runtime env carries `API_TOKEN_SCOPE=api://csharp-microsof-gjx5d8-api-auth/.default`
    - the API and agent auth service principals advertise the expected stable App ID URIs
    - the frontend `/health/deep` endpoint returns `healthy` with healthy API and agent auth dependencies
    - the deployed public-profile E2E suite passed (`75` tests passed, `3` skipped) against the live MAF ACA deployment and the deployment was intentionally kept for inspection
  - The kept public Azure deployments from this iteration are:
    - OpenAI: `rg-typescript-openai-agent-sdk-aca-public-g0782`
    - Foundry Agent Service: `rg-typescript-foundry-agent-service-aca-public-fjsod`
    - Microsoft Agent Framework: `rg-csharp-microsoft-agent-framework-aca-public-wqack`
  - In this follow-up iteration, `task strategy:test:local` was rerun after the successful Azure validation and produced:
    - `L1` passed
    - `L2` passed
    - `L3` passed for the runnable TypeScript components; the C# contract checks still skipped under the same Docker gate
    - `L7` passed
    - `L8` passed
    - `L4` and `L5` still skipped because the Docker daemon is inaccessible even though the Docker CLI is installed
  - The precise local blocker is now captured, not inferred:
    - `docker --version` succeeds and `/usr/bin/docker` exists
    - `docker info` fails with `permission denied while trying to connect to the docker API at unix:///var/run/docker.sock`
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
  - Re-running `task strategy:validate:pr` after restoring `compose-helpers.ts` exposed a broader missing-library hole under `strategy-builder/scripts/lib/`, including `paths.ts` and the generator library surface expected by `compose-test-runner.ts`, `generate-strategies.ts`, `identity-test-runner.ts`, `test-all.ts`, and `validate-strategies.ts`.
  - Those missing script-library surfaces have now been restored with typed implementations that let the `strategy-builder/scripts` package pass both `npm run typecheck` and `npm run lint`.
  - The TypeScript API app also had a stale unused auth import/catch binding left from the hardened-auth work; that cleanup is now done so it no longer fails the root ESLint gate.
  - Formatting drift across the touched TypeScript files has been normalized, and `task strategy:validate:pr` now passes completely: repo lint/format, TypeScript typecheck, .NET builds, generator drift validation, and Terraform validation all succeeded in one run.
  - The generator validation shim originally stalled because local installs inside generated strategies pulled `node_modules` into the copy/diff path; it now ignores transient generated-package artifacts so the drift check compares canonical generated content instead of local validation residue.
  - The stale `L2` blockers are now fixed:
    - the frontend component tests now assert the sales/account-team copy instead of the retired pirate copy
    - the OpenAI Agent SDK streaming tests now assert the current lifecycle-event guarantees without assuming the first SSE chunk is always `tool.called`
    - the Foundry Agent Service streaming tests now provide `metadata.mode` when they expect specialist lifecycle events and distinguish the specialist lifecycle events from knowledge-tool lifecycle events
  - `task strategy:test:local` now passes all runnable layers in this environment:
    - `L1` lint/typecheck: passed
    - `L2` unit tests: passed
    - `L3` contract compliance: passed for the runnable TypeScript components; C# contract checks were skipped there because Docker is unavailable
    - `L7` generator validation: passed
    - `L8` Terraform validation: passed
    - `L4` and `L5` remain skipped because Docker is not available in this environment
  - The frontend `App.test.tsx` suite still emits React `act(...)` warnings in passing runs, but those warnings are no longer a gate for the local validation lane.
  - The first deployed Azure validation run for `deployment-strategies/foundry_agentic_app/typescript-openai-agent-sdk-aca` reached real Azure provisioning, then failed before endpoint exercise because the deploy script still assumed a local Docker daemon via `az acr login`.
  - That deploy-script blocker is now fixed in `strategy-builder/scripts/deploy-strategy-azure.ts` by replacing the local Docker/`az acr login` path with remote `az acr build`, which is compatible with this environment.
  - Retrying the same deployed validation with `--keep-deployed` proved the image-build step now works, and Azure Container Apps were created successfully:
    - frontend container app `typescript-open-25u1gd-frontend`
    - API container app `typescript-open-25u1gd-api`
    - agent container app `typescript-open-25u1gd-agent`
  - The remaining Azure failure is now a reference-architecture/deploy env mismatch rather than a build/runtime harness issue:
    - frontend logs show startup failure because `API_TOKEN_SCOPE` is missing
    - API logs show startup failure because `AGENT_TOKEN_SCOPE` is missing
    - agent logs show startup failure because `INBOUND_AUTH_TENANT_ID` is missing (and by extension the rest of the inbound auth contract is also not being injected)
  - The previous Azure blocker was that the shared strategy `.env` only carried model/endpoint values, while the API and agent need different inbound auth settings; a single unscoped `INBOUND_AUTH_*` key set could not represent both services correctly.
  - That mismatch is now addressed in the deployment layer:
    - the reference architecture provisions Entra applications/roles for the API and agent audiences
    - the frontend managed identity is assigned the API app role and the API managed identity is assigned the agent app role
    - Terraform now outputs `API_TOKEN_SCOPE`, `AGENT_TOKEN_SCOPE`, tenant ID, API/agent-specific audiences, and API/agent-specific caller app IDs
    - the generated strategy `.env` now stores those service-specific values under namespaced keys (`API_INBOUND_AUTH_*`, `AGENT_INBOUND_AUTH_*`)
    - `deploy-strategy-azure.ts` maps those namespaced keys back into the plain runtime env names expected by each container
  - `task strategy:validate:pr` passes again after the Azure auth-wiring implementation, including Terraform validation for the reference architecture and all generated strategies.
  - The first live rerun after that change showed the app revisions still missing the new env values, which narrowed the remaining problem further: the Azure deploy path uses the generated strategy-local `infra/` copy, not the reference-architecture root directly.
  - The ACA infra source at `strategy-builder/components/iac/azure-container-apps` and all three generated strategy `infra/` directories now carry the same auth resources and outputs (`auth.tf`, updated provider config, updated outputs), so the next Azure rerun will exercise the intended Terraform surface instead of the stale copy.
  - The next Azure rerun proved the strategy-local auth Terraform is now actually being applied:
    - Entra apps like `typescript-open-kwk0wi-api-auth` and `typescript-open-kwk0wi-agent-auth` were created during phase 1
    - the old failure mode moved forward from “no auth resources exist” to “phase 1 is still waiting on slower identifier-URI/service-principal work before the deploy script can consume outputs”
  - To address that, the auth Terraform was restructured again:
    - scopes and accepted audiences now derive directly from the Entra application `client_id` (`api://<client-id>`), so phase 1 can compute them without waiting for extra Graph resources
    - service principals, managed-identity lookups, and app-role assignments are now gated behind `enable_registry_auth`, which is already false in phase 1 and true in phase 2
    - caller-app allowlists remain phase-2-only, which is acceptable because they are optional hardening on top of the issuer/signature/audience checks
  - A partial public OpenAI rerun created resources under `rg-typescript-openai-agent-sdk-aca-public-qn9lp`; cleanup was started immediately after the phase-split Terraform change so the next rerun can start from a clean public-profile workspace.
  - That cleanup has now finished far enough for another rerun:
    - the Azure resource group `rg-typescript-openai-agent-sdk-aca-public-qn9lp` is gone
    - the Terraform workspace `test-typescript-openai-agent-sdk-aca-public` was removed
    - two Entra app registrations from the failed attempt still exist because `az ad app delete` returned `Insufficient privileges to complete the operation`
  - The next clean rerun under `rg-typescript-openai-agent-sdk-aca-public-g0782` proves the phase-split auth Terraform is working as intended in phase 1:
    - bootstrap apps `typescript-open-k2qx0x-agent`, `typescript-open-k2qx0x-api`, and `typescript-open-k2qx0x-frontend` are provisioned on the bootstrap image
    - Terraform outputs now expose non-null scopes and allowed audiences before phase 2 begins
    - phase 2 has started and ACR task run `dt1` is building the agent image
  - Cleanup for the previous kept `typescript-openai-agent-sdk-aca` public-profile deployment had already completed before this wiring work. The Azure resource group `rg-typescript-openai-agent-sdk-aca-public-ryq4g` no longer exists, so the next Azure run starts clean.
  - The Azure runtime credential path is now aligned across the source stacks:
    - the frontend BFF, TypeScript API, TypeScript OpenAI agent, TypeScript Foundry agent, C# API token provider, and C# MAF Azure OpenAI client now choose `ManagedIdentityCredential` whenever `IDENTITY_ENDPOINT`/`MSI_ENDPOINT` is present and fall back to `DefaultAzureCredential` elsewhere
    - local azcred-based compose/dev still works with the managed-identity-style endpoint shape, so the Azure-specific fix does not require a separate local-only credential branch
    - the first validation rerun after this refactor surfaced only TypeScript nullability mismatches around `credential.getToken(...)`; those are now fixed with explicit token-presence checks
    - `task strategy:validate:pr` is green again after the credential change, including regenerated deployment strategies and Terraform validation
  - The next Azure rerun exposed a separate deployment blocker in phase 1:
    - the bootstrap Container App revisions were still using the `mcr.microsoft.com/k8se/quickstart:latest` image while keeping the real service ingress target ports (`8080`, `4000`, `3000`)
    - ACA system logs showed `Pending:PortMismatch` and repeated startup-probe failures because the bootstrap image only listened on port `80`
    - the ACA infra source and reference architecture now derive the target port from whether a real image has been supplied: bootstrap revisions use port `80`, phase-2 real revisions switch back to the service ports
    - `task strategy:validate:pr` is green again after that bootstrap-port fix, so the next Azure rerun should be able to get through phase 1 without stalling on unhealthy bootstrap revisions
  - The subsequent public OpenAI ACA rerun now gets materially farther:
    - phase 1 completes cleanly with no bootstrap port-mismatch stall
    - the deploy script passes its RBAC precheck and reaches the private-image rollout stage
    - fresh ACR task runs succeeded for the rebuilt images (`dt5`, `dt6`), and the latest tags now exist for the current deployment timestamp (`20260408044711`)
    - however, by the end of this iteration the Container Apps had still not rolled to new real-image revisions; the app state remained on the prior real-image revisions (`--0000001`) plus the bootstrap revisions (`--0000002`), so endpoint exercise on the new credential/runtime code is still pending
    - the attached deployed-test runner was stopped after the image-build stage because it was no longer emitting actionable progress while the rollout state remained unchanged
  - The next direct investigation narrowed the remaining runtime failure precisely:
    - a manual phase-2 Terraform plan in the deployed OpenAI strategy showed the expected swap from bootstrap images to the fresh `20260408044711` images plus the auth env injection, so the phase-2 target state itself was correct
    - while a direct phase-2 apply was running, ACA rolled all three apps to `--0000003` ready revisions on those images
    - exercising the new OpenAI deployment still returned the same `/api/health/deep` failure, but the container logs showed why: the deployed frontend, API, and agent code were still instantiating `DefaultAzureCredential`, which meant the Azure-host-aware credential change had not been propagated into the strategy copies that the deploy flow actually builds
    - the generated/deployment strategy copies for all three strategies have now been synced from the updated shared components:
      - TypeScript frontends now include `src/azure-credential.ts` and use `createAzureCredential()`
      - TypeScript strategy APIs now include `src/azure-credential.ts` and the corresponding app/routes/token-path updates
      - TypeScript OpenAI and Foundry strategy agents now include their `azure-credential.ts` helper and the updated credential call sites
    - the C# MAF strategy API and agent copies now match the updated managed-identity-aware source files
    - `task strategy:validate:pr` is green again after syncing those strategy copies, and generator drift validation still passes
    - the previous manual `terraform apply` shell used for investigation was stopped once the needed rollout evidence had been collected
  - A fresh manual OpenAI ACA rollout with tag `20260408052004` confirmed two distinct states:
    - the image builds and ACA revision rollout work end to end; frontend/API/agent all reached healthy `--0000005` revisions on the new tag
    - the same manual phase-2 Terraform apply still fails afterward on the known Entra tenant-permission limit: `azuread_service_principal` creation returns `403 Authorization_RequestDenied`
  - Live traffic against those `20260408052004` revisions proved the remaining runtime problem is narrower than deployment:
    - `/health` succeeds
    - `/api/health/deep` still fails from the frontend with `Response had no "expiresOn" property.`
    - frontend logs show the failure now comes specifically from the ACA managed-identity endpoint response shape, not from stale strategy copies or missing auth env
  - To handle that ACA-specific runtime issue, all TypeScript credential helpers were updated again in both shared components and generated strategy copies:
    - when `IDENTITY_ENDPOINT` is present, the code now calls the managed-identity endpoint directly, sets the ACA `X-IDENTITY-HEADER` when available, normalizes `expires_on`/`expiresOn`, and returns a standard token shape to the Azure SDK callers
    - `MSI_ENDPOINT` still falls back to `ManagedIdentityCredential`, and non-managed-identity environments still use `DefaultAzureCredential`
    - this avoids the ACA `ManagedIdentityCredential` parsing failure without changing the local/dev azcred contract
  - `task strategy:validate:pr` is green again after that direct-endpoint credential fix.
  - The currently deployed Azure revisions are still the pre-fix images from tag `20260408052004`, so the next validation step is an image-only rollout of freshly built containers from the corrected strategy source. That bypasses the unrelated Entra `403` service-principal creation limit and isolates the runtime auth proof.
  - The first image-only rollout of that fix (`20260408053652`) exposed one more runtime-only issue:
    - the new images started with Node's built-in `.ts` execution path rather than a compile step
    - TypeScript parameter properties in the new helper class are not supported in Node's strip-only mode
    - the failing syntax was removed from the shared helpers and all generated strategy copies, and `task strategy:validate:pr` is green again after the fix
  - The latest image-only rollout (`20260408054454`) reaches healthy frontend/API/agent revisions on ACA and proves the direct-endpoint credential helper is running:
    - frontend revision `--0000007` is healthy on `frontend:20260408054454`
    - API revision `--0000007` is healthy on `api:20260408054454`
    - agent revision `--0000007` is healthy on `agent:20260408054454`
    - the old `Response had no "expiresOn" property.` failure is gone
  - The remaining live Azure failure is now the tenant-permission blocker in its final form:
    - `/api/health/deep` now fails with `AADSTS500011` / `invalid_resource`
    - the resource principal `api://e8931939-37f7-4448-b1d7-ab7ccfa861ba` is missing from the tenant because the service principal creation step is still blocked
    - the same deployment session already proved the matching Terraform operation fails with `azuread_service_principal` `403 Authorization_RequestDenied`
    - without that service principal, the frontend managed identity cannot mint a token for the API audience, so end-to-end Azure conversation validation cannot be completed in this tenant from this session
  - The repository docs now make that boundary explicit instead of implying the sample alone is at fault:
    - all three ACA strategy READMEs now call out the tenant-side Entra prerequisites for service-principal and app-role-assignment creation
    - `docs/security_posture.md` now documents the tenant-scoped Entra prerequisite and the exact `403 Authorization_RequestDenied` -> `AADSTS500011` failure chain
    - `docs/troubleshooting.md` now includes a dedicated `AADSTS500011` troubleshooting path for partially deployed ACA strategies
    - `docs/developer.md` now warns contributors that subscription RBAC alone is insufficient for the hardened Azure auth path
  - A final documentation consistency sweep removed the last stale security-posture wording that still implied the old `DefaultAzureCredential`-specific local path; the docs now consistently describe a runtime-appropriate Azure credential flow across local and Azure environments.

## Immediate next step

If work resumes in an environment with working Docker-daemon access, rerun `task strategy:test:local` so `L4` container builds and `L5` compose/E2E can execute instead of skipping. Otherwise, the only practical next step is cleanup of the intentionally kept Azure deployments once they are no longer needed for inspection.

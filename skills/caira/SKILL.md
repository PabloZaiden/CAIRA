---
name: caira
description: Primary entrypoint for coding agents using CAIRA as reference material to design and build Azure AI solutions tailored to a user's scenario.
compatibility: Requires network access to github.com, api.github.com, and raw.githubusercontent.com.
metadata:
  author: pablozaiden
  version: "0.5.0"
---

# CAIRA

Install this skill when a user wants to build or extend an Azure AI solution with CAIRA. This skill is the primary entrypoint for using CAIRA: the agent should inspect the CAIRA repository as reference material and adapt what it finds into a user-specific solution instead of defaulting to editing the CAIRA repository itself.

## Entrypoint model

- Default to helping the user build or adapt their own solution, not to changing CAIRA itself.
- Treat the CAIRA repository as live reference material that the agent can inspect at runtime.
- Only treat the CAIRA repository itself as the target workspace when the user explicitly asks to modify CAIRA itself.

## Core rules

- Treat the CAIRA repository as the source-of-truth reference library.
- Default to creating or modifying files in the user's target workspace, not inside CAIRA, unless the user explicitly wants to change CAIRA itself.
- Discover the current reference architectures, modules, and deployment strategies at runtime instead of hardcoding lists.
- Reason across the whole product surface: layered reference-architecture infra, application components, and generated deployment strategies.
- Map discovered CAIRA assets to the user's scenario before generating code, infrastructure, or recommendations.
- Explain which CAIRA assets influenced the recommendation or generated output.
- Prefer passwordless Azure authentication unless the user explicitly requests another approach.
- Determine what the user already has before proposing or generating a full end-to-end implementation.
- Reuse existing user assets when possible, such as Foundry resources, projects, endpoints, Application Insights instances, API Management instances, and app layers.
- Treat pirate, captain, specialist, shanty, treasure, and crew content as sample-only. Never copy that sample domain as real business logic unless the user explicitly asks for sample content.
- Exclude CAIRA internal testing and deployed-validation overlay assets from the default reference set unless the user explicitly asks for testing infrastructure.
- Treat deployment strategies as composable slices, not all-or-nothing bundles. Copy or adapt only the slices the user actually needs.
- Do not bring a whole CAIRA strategy into the target solution just to disable most of it later. Prefer omitting unused slices entirely.
- If the user wants APIM / AI gateway behavior, include the whole APIM slice together: Terraform resources, outputs, environment wiring, deploy/test wiring, and any related docs or policies.
- If the user does not want APIM, ignore that slice completely and remove APIM-specific code, variables, outputs, and documentation from the target solution instead of carrying them in a disabled state.
- Apply the same selective-slice rule to every major feature area: observability, private networking, capability hosts, extra projects, testing overlays, frontend, API, and agent containers.

## Dynamic discovery workflow

1. Resolve the source version (tag, branch, or release).
1. Inspect the user's project and requirements first to determine which architecture slices are missing versus already present.
1. Identify feature slices and their supporting files before copying anything. For example, treat APIM, observability, private networking, capability hosts, app layers, and testing overlays as separate selectable slices.
1. Discover available assets from repository APIs:
   - `strategy-builder/infra/reference-architectures/`
   - `strategy-builder/infra/modules/`
   - `strategy-builder/infra/testing/`
   - `strategy-builder/`
   - `deployment-strategies/`
   - `docs/` and `skills/`
1. Inspect the default reference architecture first (`strategy-builder/infra/reference-architectures/foundry_agentic_app/`), starting with `README.md`, `main.tf`, `application_platform.tf`, `agent_service.tf`, `api_service.tf`, `frontend_service.tf`, `dependant_resources.tf`, and the referenced modules, unless the user's requirements clearly demand a different discovered option.
1. Treat advanced capability-host, private-networking, and extra-project patterns as opt-in. Do not copy them by default when the basic sample already fits the user's scenario.
1. Treat selective adoption as a first-class path. Decide whether the user needs only infra, only app code, only observability hookup, only endpoint wiring, or a full end-to-end sample.
1. For every selected slice, include the supporting wiring that makes it actually work end-to-end. For every unselected slice, leave it out rather than copying it in a disabled form.
1. Exclude `testing_overlay.tf`, `testing_variables.tf`, `testing_outputs.tf`, and related internal testing assets unless the user explicitly asks for testing or validation resources.
1. Inspect the relevant files for the chosen architecture or strategy.
1. Translate the discovered CAIRA patterns into a user-specific recommendation, design, or implementation plan.
1. Present the recommendation plus trade-offs before generating changes.

## Partial adoption checklist

- Check whether the user already has a Foundry account or project.
- Check whether the user already has application hosting and only needs agent/app code.
- Check whether the user already has observability resources and only needs OTEL/App Insights hookup.
- Check whether the user already has API Management and only needs AI gateway exposure or policies.
- Check whether the user only needs resource IDs, endpoints, or environment settings from the architecture.
- Check whether each optional slice is explicitly in scope or out of scope:
  - APIM / AI gateway
  - observability
  - private networking
  - capability hosts
  - frontend
  - API
  - agent container
- For each out-of-scope slice, avoid copying its related files, variables, outputs, and docs into the target solution.

## Source-of-truth URLs

- Repository root: <https://github.com/microsoft/CAIRA>
- Latest release tag API: <https://api.github.com/repos/microsoft/CAIRA/releases/latest>
- Reference architectures listing API: `GET /repos/microsoft/CAIRA/contents/strategy-builder/infra/reference-architectures?ref=<tag_or_ref>`
- Modules listing API: `GET /repos/microsoft/CAIRA/contents/strategy-builder/infra/modules?ref=<tag_or_ref>`
- Infra testing listing API: `GET /repos/microsoft/CAIRA/contents/strategy-builder/infra/testing?ref=<tag_or_ref>`
- Strategy builder listing API: `GET /repos/microsoft/CAIRA/contents/strategy-builder?ref=<tag_or_ref>`
- Deployment strategies listing API: `GET /repos/microsoft/CAIRA/contents/deployment-strategies?ref=<tag_or_ref>`
- Docs listing API: `GET /repos/microsoft/CAIRA/contents/docs?ref=<tag_or_ref>`

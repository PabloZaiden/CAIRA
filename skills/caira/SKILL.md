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

- Default to helping the user build or adapt their own solution, not to contributing upstream changes to CAIRA.
- Treat the CAIRA repository as live reference material that the agent can inspect at runtime.
- Only treat the CAIRA repository itself as the target workspace when the user explicitly asks to modify CAIRA upstream.

## Core rules

- Treat the CAIRA repository as the source-of-truth reference library.
- Default to creating or modifying files in the user's target workspace, not inside CAIRA, unless the user explicitly wants to change CAIRA itself.
- Discover the current reference architectures, modules, and deployment strategies at runtime instead of hardcoding lists.
- Reason across the whole product surface: foundation infra, application infra, application components, and generated deployment strategies.
- Map discovered CAIRA assets to the user's scenario before generating code, infrastructure, or recommendations.
- Explain which CAIRA assets influenced the recommendation or generated output.
- Prefer passwordless Azure authentication unless the user explicitly requests another approach.

## Dynamic discovery workflow

1. Resolve the source version (tag, branch, or release).
1. Discover available assets from repository APIs:
   - `infra/architectures/`
   - `infra/modules/`
   - `strategy-builder/`
   - `deployment-strategies/`
   - `docs/` and `skills/`
1. Inspect the relevant files for the chosen architecture or strategy.
1. Translate the discovered CAIRA patterns into a user-specific recommendation, design, or implementation plan.
1. Present the recommendation plus trade-offs before generating changes.

## Source-of-truth URLs

- Repository root: <https://github.com/microsoft/CAIRA>
- Latest release tag API: <https://api.github.com/repos/microsoft/CAIRA/releases/latest>
- Reference architecture listing API: `GET /repos/microsoft/CAIRA/contents/infra/architectures?ref=<tag_or_ref>`
- Modules listing API: `GET /repos/microsoft/CAIRA/contents/infra/modules?ref=<tag_or_ref>`
- Strategy builder listing API: `GET /repos/microsoft/CAIRA/contents/strategy-builder?ref=<tag_or_ref>`
- Deployment strategies listing API: `GET /repos/microsoft/CAIRA/contents/deployment-strategies?ref=<tag_or_ref>`
- Docs listing API: `GET /repos/microsoft/CAIRA/contents/docs?ref=<tag_or_ref>`

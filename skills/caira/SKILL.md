---
name: caira
description: Primary entrypoint for coding agents using CAIRA as reference material to design and build generative AI solutions with Azure AI Foundry, Azure OpenAI-compatible endpoints, agent frameworks, APIs, and frontends tailored to a user's scenario.
compatibility: Requires network access to github.com, api.github.com, and raw.githubusercontent.com.
metadata:
  author: Microsoft
  version: "0.5.0"
---

# CAIRA

Use this skill when a user wants to build or extend a generative AI solution. CAIRA is a reference library, not an application generator: inspect the repository, select the smallest relevant reference components, and adapt them into the user's workspace.

## Core rules

- Default to modifying the user's target workspace, not the CAIRA repository, unless the user explicitly asks to change CAIRA.
- Use `reference-architectures/` as the source of truth.
- Prefer small component references over full-stack copying.
- For scenarios that need OpenAI-compatible endpoints, prefer the Foundry IaC reference unless the user already has endpoints or asks for a different approach.
- Determine what the user already has before proposing new infrastructure.
- Do not add APIM, private networking, capability-host pools, testing overlays, generated deployment strategies, auth sidecars, or localdev-only helper containers; those are out of scope for beta2.
- Explain which CAIRA paths influenced the recommendation or generated files.

## Current reference components

| Need | CAIRA reference path |
|------|----------------------|
| Foundry foundation | `reference-architectures/iac/foundry/` |
| Container Apps hosting for API + frontend | `reference-architectures/iac/container-apps/` |
| TypeScript API using OpenAI Agents SDK | `reference-architectures/app/api/typescript/openai-agents-sdk/` |
| TypeScript API using Foundry Agent Service | `reference-architectures/app/api/typescript/foundry-agent-service/` |
| C# API using Microsoft Agent Framework | `reference-architectures/app/api/csharp/microsoft-agent-framework/` |
| React frontend | `reference-architectures/app/frontend/typescript/react/` |
| Frontend/API contract | `reference-architectures/app/API_CONTRACT.md` |

## Intake before generating changes

Ask only what is needed to choose components:

1. What outcome is the user trying to build?
1. Do they already have Foundry/OpenAI endpoints, hosting, identity, observability, or frontend/API code?
1. Which components are needed now: Foundry, Container Apps, API, frontend, or only app code?
1. Should CAIRA assets be copied into the user's repo or referenced from a pinned CAIRA ref?

If the answer shows the user only needs one component, use only that component.

## How to use CAIRA references

1. Inspect the relevant component README and source files.
1. Copy or adapt only the files needed for the user's stack.
1. Remove sample text, model names, env vars, or Terraform variables that do not apply to the user's scenario.
1. Preserve the component's validation style: npm scripts for TypeScript, .NET build for C#, Terraform validation for IaC, Docker builds for containers.
1. Mention the exact CAIRA paths used and what was intentionally left out.

---
name: caira
description: Primary entrypoint for coding agents using CAIRA as reference material to design and build generative AI solutions with Azure AI Foundry, Azure OpenAI-compatible endpoints, agent frameworks, APIs, and frontends tailored to a user's scenario.
compatibility: Works with a local CAIRA checkout; otherwise requires network access to github.com and raw.githubusercontent.com, or git access to clone https://github.com/microsoft/caira temporarily.
metadata:
  author: Microsoft
  version: "0.4.1"
---

# CAIRA

Use this skill when a user wants to build or extend a generative AI solution. CAIRA is a reference library, not an application generator: inspect the repository, select the smallest relevant reference components, and adapt them into the user's workspace.

## Core rules

- Default to modifying the user's target workspace, not the CAIRA repository, unless the user explicitly asks to change CAIRA.
- Use `https://github.com/microsoft/caira/reference-architectures` as the canonical source of truth. Inspect it live through GitHub/raw URLs or clone the repository temporarily to inspect `reference-architectures/` locally; when a local `reference-architectures/` checkout is already available, use it.
- Prefer small component references over full-stack copying.
- For scenarios that need OpenAI-compatible endpoints, prefer the Foundry IaC reference unless the user already has endpoints or asks for a different approach.
- Determine what the user already has before proposing new infrastructure.
- Keep recommendations focused on the current reference components listed below.
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

If the answer shows the user only needs one component, use only that component.

## How to use CAIRA references

1. Inspect the relevant component source files.
1. Copy or adapt only the files needed for the user's stack.
1. Remove sample text, model names, env vars, or Terraform variables that do not apply to the user's scenario.
1. Preserve the component's validation style: npm scripts for TypeScript, .NET build for C#, Terraform validation for IaC, Docker builds for containers.
1. Mention the exact CAIRA paths used and what was intentionally left out.

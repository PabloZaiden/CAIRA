# CAIRA

CAIRA (Composable AI Reference Architectures) is a small reference library for agents building Azure AI solutions. The primary entrypoint is the CAIRA skill: install the skill, let your coding agent inspect this repository, and have it copy or adapt only the reference pieces that fit your scenario.

CAIRA beta2 intentionally avoids generated end-to-end deployments. Each directory under `reference-architectures/` is an independent reference component that should be easy to read, validate, copy, and modify.

## Quickstart

Install the skill from your project directory:

```bash
bunx skills add github.com/microsoft/CAIRA/skills
```

or:

```bash
npx skills add github.com/microsoft/CAIRA/skills
```

Then ask your agent to use CAIRA for your scenario, for example:

```text
Use CAIRA to create a simple Azure AI app with Foundry, an API, and a React frontend.
```

## Repository layout

```text
reference-architectures/
  iac/
    foundry/
    container-apps/
  app/
    API_CONTRACT.md
    api/
      typescript/
        openai-agents-sdk/
        foundry-agent-service/
      csharp/
        microsoft-agent-framework/
    frontend/
      typescript/
        react/
skills/
docs/
```

## Reference components

| Path | Purpose |
|------|---------|
| `reference-architectures/iac/foundry/` | Minimal Terraform for a Foundry account, project, and model deployment. |
| `reference-architectures/iac/container-apps/` | Minimal Terraform for Azure Container Apps hosting exactly two apps: API and frontend. |
| `reference-architectures/app/api/typescript/openai-agents-sdk/` | Unified API + agent reference using the OpenAI Agents SDK. |
| `reference-architectures/app/api/typescript/foundry-agent-service/` | Unified API + agent reference using Foundry Agent Service. |
| `reference-architectures/app/api/csharp/microsoft-agent-framework/` | Unified API + agent reference for C# and Microsoft Agent Framework. |
| `reference-architectures/app/frontend/typescript/react/` | Minimal React frontend with a small BFF proxy to the API. |

## Contributor workflow

Install dependencies and validate all reference components:

```bash
task bootstrap
task validate
```

Validation is intentionally component-local: TypeScript components use npm scripts, C# uses .NET build, Terraform uses `fmt/init/validate`, and each app container has a Dockerfile that can be built independently.

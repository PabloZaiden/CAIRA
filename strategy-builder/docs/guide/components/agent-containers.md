# Agent Containers

The agent layer has three interchangeable implementations. All conform to the same [Agent API contract](../contracts.md) and can be swapped without changes to the API container, frontend, or infrastructure.

## Common architecture

All three variants share the same high-level contract and a similar file layout:

```text
components/agent/typescript/<variant>/
├── src/
│   ├── server.ts           # Entry point: starts Fastify, graceful shutdown
│   ├── app.ts              # Fastify factory: creates app, registers routes + auth hooks
│   ├── config.ts           # Loads + validates environment variables
│   ├── <sdk>-client.ts     # SDK wrapper: maps framework API to conversation model
│   ├── routes.ts           # Route handlers: REST endpoints + SSE streaming + metrics
│   └── types.ts            # Shared types (mirrors agent-api.openapi.yaml schemas)
├── tests/
│   ├── config.test.ts      # Config loading tests
│   ├── <sdk>-client.test.ts # SDK client tests (mocked SDK)
│   └── routes.test.ts      # Route handler tests (mocked client)
├── Dockerfile              # Multi-stage: node:24-alpine
├── package.json
├── tsconfig.json           # Extends ../../tsconfig.base.json
├── vitest.config.ts
└── component.json          # Component manifest
```

### Key patterns

- **`app.ts` is the testable unit.** It creates a Fastify instance without starting a listener, so tests can inject it directly via `app.inject()`.
- **SDK client is injectable.** The `buildApp()` function accepts override options for the SDK client, allowing tests to inject mocks.
- **Auth hook is conditional.** When `SKIP_AUTH=true`, inbound validation is bypassed for local mock/dev flows. Otherwise the containers validate Entra-issued bearer tokens for issuer, audience, expiry, and optional caller application IDs.
- **No build step.** Runs directly via `node src/server.ts`.

### Sample domain

The current sample domain is a fictional **sales / account-team** scenario with three activities:

- `discovery` -> opportunity discovery / qualification
- `planning` -> account planning / engagement
- `staffing` -> account-team staffing

Those internal mode IDs remain in the HTTP contract for compatibility, but the user-facing prompts and UX are being reframed around the business scenario.

### Multi-agent architecture

The implementations use **different orchestration patterns** to coordinate the three specialists:

**OpenAI Agent SDK — Coordinator + Agent-as-Tool:**

- **Coordinator agent** — the sole conversational agent. Talks to the user directly, invokes specialist agent-tools when an activity is active, and calls resolution tools when the activity concludes.
- Specialists are wrapped with `.asTool()` — they receive input from the coordinator, call the LLM, and return content. They are not conversational agents.
- The coordinator has **6 tools**: 3 specialist agent-tools (`discovery_specialist`, `planning_specialist`, `staffing_specialist`) + 3 resolution FunctionTools (`resolve_discovery`, `resolve_planning`, `resolve_staffing`).
- No triage agent, no handoffs.

**Foundry Agent Service — Triage + Connected Agents:**

- **Triage agent** — receives every message, examines conversation context, and hands off to the appropriate specialist via connected agent tools.
- **Re-triage every turn:** Each message starts with the triage agent (not sticky routing). The triage agent sees the full conversation history and decides which specialist should handle the response.
- **Fallback** — if triage can't match an activity, responds as a general assistant within the fictional sample domain.

**Microsoft Agent Framework — Workflow per mode:**

- **No coordinator or triage runtime agent.** The C# implementation does not currently create a conversational coordinator and does not re-triage every turn.
- **Mode is selected from conversation metadata.** The workflow runner chooses one prebuilt workflow per mode (`discovery`, `planning`, `staffing`) when the conversation is created or resumed.
- **Each workflow has one specialist executor.** The specialist talks directly to the user, uses local knowledge and resolution tools, and resumes through workflow checkpoints across turns.
- **Shared instructions are still applied.** `SHARED_INSTRUCTIONS` exists as a shared instruction block for consistency with the other variants, but it is not a separate orchestration agent in the C# runtime.

**Common to all variants:**

- **Discovery agent** — opportunity discovery specialist
- **Planning agent** — account planning specialist
- **Staffing agent** — account-team staffing specialist

### Resolution tools

Each specialist agent defines an **activity-specific resolution tool** with domain-specific parameters:

| Activity              | Tool                | Parameters                                                                                         |
|-----------------------|---------------------|----------------------------------------------------------------------------------------------------|
| Opportunity discovery | `resolve_discovery` | `fit: "qualified"\|"unqualified"\|"follow_up"`, `signals_reviewed: number`, `primary_need: string` |
| Account planning      | `resolve_planning`  | `approved: boolean`, `focus_area: string`, `next_step: string`                                     |
| Account-team staffing | `resolve_staffing`  | `coverage_level: string`, `role: string`, `team_name: string`                                      |

When a specialist determines an activity is complete, it calls its resolution tool. The local handler captures the structured result and the streaming layer emits an `activity.resolved` SSE event. Conversations remain open after resolution.

**How multi-agent works per framework:**

| Aspect                  | OpenAI Agent SDK                                                  | Foundry Agent Service                                     | Microsoft Agent Framework                                             |
|-------------------------|-------------------------------------------------------------------|-----------------------------------------------------------|-----------------------------------------------------------------------|
| **Orchestration agent** | Coordinator agent (single conversational agent)                   | Triage agent (silent router)                              | None; one workflow is selected per mode                               |
| **Mechanism**           | Agent-as-tool (`.asTool()`) + resolution FunctionTools            | Connected agents (`ToolUtility.createConnectedAgentTool`) | One specialist executor + local tools inside a per-mode workflow      |
| **Orchestration**       | Client-side (SDK run loop invokes specialist tools transparently) | Server-side (Azure AI Foundry handles delegation)         | Server-side workflow runner resumes the selected mode-specific graph  |
| **Streaming**           | Emits `tool.called`/`tool.done` SSE events for specialist tools   | Completes normally after server-side orchestration        | Streams specialist output and workflow events from the selected graph |
| **Client code impact**  | None — existing `sendMessageStream()` works unchanged             | None — run just takes longer and completes normally       | None — same HTTP contract, but routing is metadata-driven per mode    |

**Prompt configuration:** Each specialist agent has its own system prompt. Prompts are hardcoded defaults in each variant, overridable via environment variables (see configuration tables below). In the C# variant, the shared `SHARED_INSTRUCTIONS` block is prepended to each specialist prompt; it does not instantiate a separate coordinator runtime agent.

### Endpoints

All agent containers implement these endpoints:

| Endpoint                                       | Method              | Handler                                                        |
|------------------------------------------------|---------------------|----------------------------------------------------------------|
| `POST /conversations`                          | Create conversation | `createConversation(metadata?)`                                |
| `GET /conversations`                           | List conversations  | `listConversations(offset, limit)`                             |
| `GET /conversations/:conversationId`           | Get conversation    | `getConversation(id)`                                          |
| `POST /conversations/:conversationId/messages` | Send message        | `sendMessage(id, content)` or `sendMessageStream(id, content)` |
| `GET /health`                                  | Health check        | `checkHealth()`                                                |
| `GET /identity`                                | Credential check    | Validates `DefaultAzureCredential`, returns identity claims    |
| `GET /metrics`                                 | Prometheus metrics  | Counter-based metrics                                          |

### Metrics

Both variants expose Prometheus-compatible metrics at `GET /metrics`:

- `agent_requests_total` -- total HTTP requests
- `agent_conversations_created_total` -- conversations created
- `agent_messages_sent_total` -- messages sent
- `agent_errors_total` -- total errors
- `agent_prompt_tokens_total` -- prompt tokens consumed
- `agent_completion_tokens_total` -- completion tokens consumed

---

## Foundry Agent Service variant

**Directory:** `components/agent/typescript/foundry-agent-service/`
**SDK:** `@azure/ai-projects` (AIProjectClient) + `openai`
**API style:** Agent CRUD + Responses API

### How it works

The Foundry variant uses `@azure/ai-projects` v2 SDK for agent management and the Responses API for conversations:

1. **Initialization:** Creates an `AIProjectClient` with `DefaultAzureCredential`, registers agents via `project.agents.create()`, then obtains an OpenAI client via `project.getOpenAIClient()`.
1. **Create conversation:** Creates a local conversation record in memory. No server-side thread — conversations are chained via `previous_response_id`.
1. **Send message:** Calls `openai.responses.create()` with the coordinator agent's instructions and tools. Implements a manual tool-call loop: checks output for `function_call` items, executes tools (specialist agents or resolution tools), submits outputs, repeats until only text remains. For streaming, uses `openai.responses.stream()` with callback-based chunk delivery.
1. **List/get conversations:** Maintained in a local Map, same as the OpenAI variant. For production, this would be backed by a database.

### Configuration

| Variable                              | Required               | Default                             | Description                               |
|---------------------------------------|------------------------|-------------------------------------|-------------------------------------------|
| `AZURE_AI_PROJECT_ENDPOINT`           | Yes                    | --                                  | Azure AI Foundry project endpoint         |
| `PORT`                                | No                     | `3000`                              | Server port                               |
| `HOST`                                | No                     | `0.0.0.0`                           | Server host                               |
| `AGENT_MODEL`                         | No                     | `gpt-5.2-chat`                      | Model deployment name                     |
| `AGENT_NAME`                          | No                     | `caira-account-team-agent`          | Agent display name                        |
| `SHARED_INSTRUCTIONS`                 | No                     | (built-in)                          | Shared system prompt for the triage agent |
| `DISCOVERY_INSTRUCTIONS`              | No                     | (built-in)                          | Opportunity discovery specialist prompt   |
| `PLANNING_INSTRUCTIONS`               | No                     | (built-in)                          | Account planning specialist prompt        |
| `STAFFING_INSTRUCTIONS`               | No                     | (built-in)                          | Account-team staffing specialist prompt   |
| `LOG_LEVEL`                           | No                     | `info`                              | Pino log level                            |
| `SKIP_AUTH`                           | No                     | `false`                             | Skip bearer token validation              |
| `INBOUND_AUTH_TENANT_ID`              | When `SKIP_AUTH=false` | --                                  | Entra tenant used to derive valid issuers |
| `INBOUND_AUTH_ALLOWED_AUDIENCES`      | When `SKIP_AUTH=false` | --                                  | Comma-separated accepted audiences        |
| `INBOUND_AUTH_ALLOWED_CALLER_APP_IDS` | No                     | --                                  | Optional caller application allowlist     |
| `INBOUND_AUTH_AUTHORITY_HOST`         | No                     | `https://login.microsoftonline.com` | Authority host override                   |

### Dependencies

- `@azure/ai-projects` ^2 -- AI Projects v2 SDK (agent CRUD + OpenAI client)
- `@azure/identity` ^4 -- DefaultAzureCredential
- `openai` ^5 -- Responses API client (via `getOpenAIClient()`)
- `fastify` ^5 -- HTTP framework

### Tests

```bash
cd components/agent/typescript/foundry-agent-service
npm install && npm run test
```

- `config.test.ts` -- config loading, defaults, missing required vars
- `foundry-client.test.ts` -- conversation CRUD, message sending, streaming, health check (all with mocked AIProjectClient + OpenAI client)
- `routes.test.ts` -- HTTP endpoint behavior, auth, error handling, SSE format

---

## OpenAI Agent SDK variant

**Directory:** `components/agent/typescript/openai-agent-sdk/`
**SDK:** `@openai/agents` + `openai` (AzureOpenAI)
**API style:** Responses API (stateless)

### How it works

The OpenAI variant uses **client-side state** with the Responses API:

1. **Initialization:** Creates an `AzureOpenAI` client with `DefaultAzureCredential` and `getBearerTokenProvider`, sets it as the default OpenAI client. Creates an Agent object (synchronous, no server call).
1. **Create conversation:** Generates a local ID and creates a conversation record in memory. No server call.
1. **Send message:** Calls `run(agent, input, { previousResponseId })`. The Responses API is stateless -- conversation continuity is maintained by chaining response IDs. For streaming, passes `stream: true` and iterates over `RunRawModelStreamEvent` events.
1. **List/get conversations:** From the local conversation Map with accumulated messages.

### Configuration

| Variable                              | Required               | Default                             | Description                                        |
|---------------------------------------|------------------------|-------------------------------------|----------------------------------------------------|
| `AZURE_OPENAI_ENDPOINT`               | Yes                    | --                                  | Azure OpenAI endpoint URL or APIM gateway root URL |
| `PORT`                                | No                     | `3000`                              | Server port                                        |
| `HOST`                                | No                     | `0.0.0.0`                           | Server host                                        |
| `AZURE_OPENAI_API_VERSION`            | No                     | `2025-03-01-preview`                | API version                                        |
| `AGENT_MODEL`                         | No                     | `gpt-5.2-chat`                      | Model deployment name                              |
| `AGENT_NAME`                          | No                     | `CAIRA Account Team Agent`          | Agent display name                                 |
| `SHARED_INSTRUCTIONS`                 | No                     | (built-in)                          | Shared system prompt for the coordinator agent     |
| `DISCOVERY_INSTRUCTIONS`              | No                     | (built-in)                          | Opportunity discovery specialist prompt            |
| `PLANNING_INSTRUCTIONS`               | No                     | (built-in)                          | Account planning specialist prompt                 |
| `STAFFING_INSTRUCTIONS`               | No                     | (built-in)                          | Account-team staffing specialist prompt            |
| `LOG_LEVEL`                           | No                     | `info`                              | Pino log level                                     |
| `SKIP_AUTH`                           | No                     | `false`                             | Skip bearer token validation                       |
| `INBOUND_AUTH_TENANT_ID`              | When `SKIP_AUTH=false` | --                                  | Entra tenant used to derive valid issuers          |
| `INBOUND_AUTH_ALLOWED_AUDIENCES`      | When `SKIP_AUTH=false` | --                                  | Comma-separated accepted audiences                 |
| `INBOUND_AUTH_ALLOWED_CALLER_APP_IDS` | No                     | --                                  | Optional caller application allowlist              |
| `INBOUND_AUTH_AUTHORITY_HOST`         | No                     | `https://login.microsoftonline.com` | Authority host override                            |

### Dependencies

- `@openai/agents` ^0.4 -- OpenAI Agent SDK
- `openai` ^6.20 -- OpenAI client (AzureOpenAI)
- `@azure/identity` ^4 -- DefaultAzureCredential
- `fastify` ^5 -- HTTP framework

### Tests

```bash
cd components/agent/typescript/openai-agent-sdk
npm install && npm run test
```

- `config.test.ts` -- config loading, defaults, missing required vars
- `openai-client.test.ts` -- conversation CRUD, message sending, streaming, health check (with injected `runFn`)
- `routes.test.ts` -- HTTP endpoint behavior, auth, error handling, SSE format

---

## C# / Microsoft Agent Framework variant

**Directory:** `components/agent/csharp/microsoft-agent-framework/`
**SDK:** `Microsoft.Agents.AI.OpenAI` + `Azure.AI.OpenAI`
**API style:** Responses API with metadata-driven workflow selection

### How it works

The C# variant uses the **Microsoft Agent Framework** (`Microsoft.Agents.AI.OpenAI`) with **one workflow per activity mode**, not the same coordinator/triage orchestration used by the TypeScript variants:

1. **Initialization:** Creates an `AzureOpenAIClient` with `DefaultAzureCredential`, then builds three specialist executors and binds each one into its own workflow.
1. **Create conversation:** Generates a local ID and creates a conversation record in memory. No server call.
1. **Send message:** Reads the conversation's `metadata.mode`, resumes the matching workflow, and lets that specialist call local knowledge and resolution tools. For streaming, emits SSE events as chunks and workflow events arrive.
1. **List/get conversations:** From a local `ConcurrentDictionary`.

This makes the C# variant conceptually similar to the others at the **HTTP contract** and **specialist/tool** layers, but not identical at the orchestration layer.

### Configuration

| Variable                              | Required               | Default                             | Description                                        |
|---------------------------------------|------------------------|-------------------------------------|----------------------------------------------------|
| `AZURE_OPENAI_ENDPOINT`               | Yes                    | --                                  | Azure OpenAI endpoint URL or APIM gateway root URL |
| `PORT`                                | No                     | `3000`                              | Server port                                        |
| `HOST`                                | No                     | `0.0.0.0`                           | Server host                                        |
| `AZURE_OPENAI_API_VERSION`            | No                     | `2025-03-01-preview`                | API version                                        |
| `AGENT_MODEL`                         | No                     | `gpt-5.2-chat`                      | Model deployment name                              |
| `AGENT_NAME`                          | No                     | `CAIRA Account Team Agent`          | Agent display name                                 |
| `SHARED_INSTRUCTIONS`                 | No                     | (built-in)                          | Shared instruction block prepended to specialists  |
| `DISCOVERY_INSTRUCTIONS`              | No                     | (built-in)                          | Opportunity discovery specialist prompt            |
| `PLANNING_INSTRUCTIONS`               | No                     | (built-in)                          | Account planning specialist prompt                 |
| `STAFFING_INSTRUCTIONS`               | No                     | (built-in)                          | Account-team staffing specialist prompt            |
| `LOG_LEVEL`                           | No                     | `Debug`                             | ASP.NET log level                                  |
| `SKIP_AUTH`                           | No                     | `false`                             | Skip bearer token validation                       |
| `INBOUND_AUTH_TENANT_ID`              | When `SKIP_AUTH=false` | --                                  | Entra tenant used to derive valid issuers          |
| `INBOUND_AUTH_ALLOWED_AUDIENCES`      | When `SKIP_AUTH=false` | --                                  | Comma-separated accepted audiences                 |
| `INBOUND_AUTH_ALLOWED_CALLER_APP_IDS` | No                     | --                                  | Optional caller application allowlist              |
| `INBOUND_AUTH_AUTHORITY_HOST`         | No                     | `https://login.microsoftonline.com` | Authority host override                            |

### Dependencies

- `Microsoft.Agents.AI.OpenAI` -- Microsoft Agent Framework (OpenAI integration)
- `Azure.AI.OpenAI` -- Azure OpenAI client
- `Azure.Identity` -- DefaultAzureCredential

### Tests

```bash
cd components/agent/csharp/microsoft-agent-framework
dotnet test
```

### File structure

```text
components/agent/csharp/microsoft-agent-framework/
├── AgentClient.cs      # SDK wrapper: coordinator + specialist agents + tool loop
├── Config.cs           # Configuration loading + default prompts
├── Models.cs           # Types matching agent-api.openapi.yaml
├── Routes.cs           # Minimal API route handlers
├── Program.cs          # Entry point + middleware setup
├── Dockerfile          # Multi-stage: .NET 10 SDK → runtime
├── component.json      # Component manifest
└── tests/              # NUnit tests
```

---

## Docker builds

### Local testing with mocks

All three agent variants can run locally without Azure credentials using the unified mock at `testing/mocks/ai-mock/`. The mock simulates the Azure AI Foundry Agent CRUD API and the OpenAI Responses API on port 8100, including multi-agent routing, SSE streaming, and resolution tools.

The easiest way to run the full stack with mocks is via Docker Compose:

```bash
# Start full stack (frontend + API + agent + mock) with hot-reload
npm run dev -- deployment-strategies/foundry_agentic_app/typescript-foundry-agent-service-aca

# Or run compose E2E tests against mocks
npm run test:compose -- deployment-strategies/foundry_agentic_app/typescript-foundry-agent-service-aca
```

When running with mocks, the compose overlay automatically sets `SKIP_AUTH=true` and points the agent's endpoint to the mock container. See [Testing](../testing.md) for details on the mock infrastructure and compose test runner.

### Docker image

The two TypeScript variants use the same Dockerfile pattern (the C# variant uses a .NET multi-stage build instead):

```dockerfile
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/
EXPOSE 3000
USER node
CMD ["node", "src/server.ts"]
```

Key points:

- Multi-stage build: dependency install in one stage, lean runtime in another
- Runs as non-root `node` user
- No build step -- TypeScript is executed directly via Node.js native support
- `tsconfig.json` and `tsconfig.base.json` are **not** copied (not needed at runtime)

### Build and run

```bash
# Build
docker build -t caira-agent-foundry components/agent/typescript/foundry-agent-service

# Run
docker run -p 3000:3000 \
  -e AZURE_AI_PROJECT_ENDPOINT=https://your-endpoint \
  -e SKIP_AUTH=true \
  caira-agent-foundry

# Health check
curl http://localhost:3000/health
```

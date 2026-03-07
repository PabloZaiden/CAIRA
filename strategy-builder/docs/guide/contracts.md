# API Contracts

The contracts define the REST interfaces between components. They live in the `contracts/` directory and are the source of truth for component interoperability.

## Overview

There are two OpenAPI 3.1.0 specifications:

| Contract     | File                                 | Who implements it                | Who calls it  |
|--------------|--------------------------------------|----------------------------------|---------------|
| Agent API    | `contracts/agent-api.openapi.yaml`   | Agent containers (both variants) | API container |
| Business API | `contracts/backend-api.openapi.yaml` | API container                    | Frontend      |

## Agent API (`agent-api.openapi.yaml`)

The generic conversation API that all agent implementations must conform to. This is the swappability layer -- any agent that implements this contract can be placed behind the API container.

| Endpoint                                   | Method | Description                                          |
|--------------------------------------------|--------|------------------------------------------------------|
| `/conversations`                           | POST   | Create a new conversation                            |
| `/conversations`                           | GET    | List conversations (paginated: `?offset=0&limit=20`) |
| `/conversations/{conversationId}`          | GET    | Get conversation details + message history           |
| `/conversations/{conversationId}/messages` | POST   | Send a message (SSE stream or JSON response)         |
| `/health`                                  | GET    | Health check with dependency status                  |
| `/metrics`                                 | GET    | Prometheus-compatible metrics                        |

### Authentication

The agent API expects a bearer token in the `Authorization` header. The API container acquires this token via `DefaultAzureCredential`. In local development with `SKIP_AUTH=true`, token validation is bypassed.

### Streaming behavior

The `/conversations/{conversationId}/messages` endpoint supports both streaming and non-streaming responses:

- `Accept: text/event-stream` -- returns SSE stream (default)
- `Accept: application/json` -- returns complete JSON response after generation

### Request/response schemas

**Create conversation:**

```json
// POST /conversations
// Request:
{ "metadata": { "source": "web" } }   // optional

// Response (201):
{
  "id": "thread_abc123",
  "createdAt": "2026-02-13T...",
  "updatedAt": "2026-02-13T...",
  "metadata": { "source": "web" }
}
```

**Send message:**

```json
// POST /conversations/{id}/messages
// Request:
{ "content": "Ahoy there!" }

// Response (200, JSON mode):
{
  "id": "msg_xyz789",
  "role": "assistant",
  "content": "Arr, welcome aboard!",
  "createdAt": "2026-02-13T...",
  "usage": { "promptTokens": 10, "completionTokens": 8 }
}
```

## Business API (`backend-api.openapi.yaml`)

The pirate-themed public API that the frontend calls. Exposes business operations (sea shanty battle, treasure hunt, crew enlistment) that create conversations on the agent and return a mode-specific `syntheticMessage` for the frontend to send as the first parley.

> **WS-12 rework:** These endpoints replace the previous `recruit`, `crew`, `crew/{crewId}/parley`, and `treasure` endpoints.

| Endpoint                                  | Method | Description                                  | Maps to agent API                   |
|-------------------------------------------|--------|----------------------------------------------|-------------------------------------|
| `POST /api/pirate/shanty`                 | POST   | Start a sea shanty battle                    | `POST /conversations`               |
| `POST /api/pirate/treasure`               | POST   | Start a treasure hunt                        | `POST /conversations`               |
| `POST /api/pirate/crew/enlist`            | POST   | Enlist in the crew (interview)               | `POST /conversations`               |
| `GET /api/pirate/adventures`              | GET    | List all adventures (with mode + status)     | `GET /conversations`                |
| `GET /api/pirate/adventures/{id}`         | GET    | Get adventure detail with messages + outcome | `GET /conversations/{id}`           |
| `POST /api/pirate/adventures/{id}/parley` | POST   | Continue chatting (SSE stream)               | `POST /conversations/{id}/messages` |
| `GET /api/pirate/stats`                   | GET    | Activity stats per mode                      | Computed from `GET /conversations`  |
| `GET /health`                             | GET    | Health check (includes agent health)         | Checks agent `/health` too          |

### Business operation flow

Each business operation (shanty, treasure, crew/enlist) follows the same pattern:

1. **Create conversation:** API calls `POST /conversations` on the agent and stores adventure metadata
1. **Return to frontend:** API returns `{ id, mode, status, syntheticMessage, createdAt }`
1. **Get first agent response:** frontend sends `syntheticMessage` to `POST /api/pirate/adventures/{id}/parley`; the API forwards to `POST /conversations/{id}/messages`

```json
// POST /api/pirate/shanty
// Request: (empty body or optional metadata)
{}

// Response (201):
{
  "id": "conv_abc123",
  "mode": "shanty",
  "status": "active",
  "syntheticMessage": "Sing me a sea shanty and challenge me to a verse duel! Let us trade shanty verses back and forth.",
  "createdAt": "2026-02-14T..."
}
```

```json
// GET /api/pirate/adventures/{id} (after resolution)
{
  "id": "conv_abc123",
  "mode": "shanty",
  "status": "resolved",
  "outcome": {
    "result": "win",
    "summary": "Won the Sea Shanty Battle in 4 rounds"
  },
  "messages": [...]
}
```

### Authentication

The business API is **not exposed to the public network** — it is only accessible from the BFF (Backend for Frontend) server. When `SKIP_AUTH=false` (default), the API requires a non-empty `Authorization: Bearer <token>` header on business endpoints, and the BFF injects that header for all `/api/*` requests. The API uses the same bearer pattern when calling the agent container.

## SSE event format

Both APIs use the same SSE event format for streaming responses:

```text
event: message.delta
data: {"content": "Arr, "}

event: message.delta
data: {"content": "welcome "}

event: message.delta
data: {"content": "aboard!"}

event: message.complete
data: {"messageId": "msg_xyz", "content": "Arr, welcome aboard!", "usage": {"promptTokens": 10, "completionTokens": 8}}
```

### Specialist tool activity events (OpenAI variant only)

When the captain agent invokes a specialist agent-tool during streaming, the agent container emits `tool.called` and `tool.done` events. The frontend uses these to show specialist-specific loading text (e.g., "The shanty specialist is working..."):

```text
event: tool.called
data: {"toolName": "shanty_specialist"}

event: tool.done
data: {"toolName": "shanty_specialist"}
```

Only emitted for specialist tools (`shanty_specialist`, `treasure_specialist`, `crew_specialist`), not for resolution tools. The API container passes these events through to the frontend.

### Activity resolution event

When a specialist agent calls its resolution tool, the agent container emits an `activity.resolved` SSE event:

```text
event: activity.resolved
data: {"tool": "resolve_shanty", "result": {"winner": "user", "rounds": 4, "best_verse": "Through storms and gales we sail with glee..."}}
```

The API container **parses** the SSE stream (not raw passthrough) to detect `activity.resolved` events, capture outcomes, and pass them through to the frontend.

For non-streaming (JSON) responses, the `sendMessage` response includes an optional `resolution` field:

```json
{
  "id": "msg_xyz",
  "role": "assistant",
  "content": "And with that final verse, ye've won!",
  "createdAt": "...",
  "usage": { "promptTokens": 50, "completionTokens": 30 },
  "resolution": {
    "tool": "resolve_shanty",
    "result": { "winner": "user", "rounds": 4, "best_verse": "..." }
  }
}
```

### Error event

On error during streaming:

```text
event: error
data: {"code": "agent_error", "message": "The seas be rough today"}
```

## Inter-service communication

See `contracts/INTER-SERVICE.md` for the full specification of:

- Service discovery (`AGENT_SERVICE_URL` environment variable)
- Authentication flow (DefaultAzureCredential -> bearer token)
- Retry and error handling (429/503 retry, circuit breaker, timeouts)
- SSE streaming passthrough behavior

## Validating contracts

The contracts project uses Redocly CLI for validation:

```bash
cd contracts
npm install
npm run validate    # Validates both specs against Redocly recommended ruleset
```

The `testing/contract-validator/` project validates running services against these specs at runtime. See [Testing](./testing.md) for details.

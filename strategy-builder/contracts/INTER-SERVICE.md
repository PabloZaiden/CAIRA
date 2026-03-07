# Inter-Service Communication Contract

How the API container (business layer) communicates with the agent container at runtime.

## Service Discovery

The API container locates the agent container via the `AGENT_SERVICE_URL` environment variable.

| Environment          | Value                                                      | Notes                                |
|----------------------|------------------------------------------------------------|--------------------------------------|
| Local development    | `http://localhost:3000`                                    | Agent runs on port 3000 by default   |
| Docker Compose       | `http://agent:3000`                                        | Docker service name resolution       |
| Azure Container Apps | `https://<agent-app>.internal.<env>.azurecontainerapps.io` | Internal FQDN, not publicly routable |

The API container must fail fast at startup if `AGENT_SERVICE_URL` is not set.

## Authentication Flow

All communication between the API container and the agent container uses Azure AD bearer tokens acquired via `DefaultAzureCredential` from `@azure/identity`.

### How it works

1. **API container** calls `DefaultAzureCredential.getToken(scope)` to acquire a token
1. **API container** sends the token in the `Authorization: Bearer <token>` header
1. **Agent container** validates the token (audience, issuer, expiry)

### Environment behavior

| Environment          | How `DefaultAzureCredential` resolves                                                        | Setup required                                                                            |
|----------------------|----------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| Local dev            | Uses `AzureCliCredential` — the developer's `az login` session                               | Run `az login` before starting                                                            |
| CI/CD                | Uses `EnvironmentCredential` or `AzureCliCredential`                                         | Configure in workflow                                                                     |
| Azure Container Apps | Uses `ManagedIdentityCredential` — the container's system-assigned or user-assigned identity | Assign Managed Identity to the container app; grant it the required role on the agent app |

### Token scope

The scope for the token request depends on the Azure AD app registration for the agent container. Typically:

```text
AGENT_TOKEN_SCOPE=api://<agent-app-client-id>/.default
```

This is configured via the `AGENT_TOKEN_SCOPE` environment variable on the API container.

### No API keys

There are no API keys, shared secrets, or "disable auth for local dev" patterns. `DefaultAzureCredential` handles all environments transparently.

## Retry and Error Handling

### Retry policy

The API container retries requests to the agent container on transient failures:

| Status code   | Meaning                                  | Retry? | Strategy                                                    |
|---------------|------------------------------------------|--------|-------------------------------------------------------------|
| 429           | Rate limited                             | Yes    | Respect `Retry-After` header; exponential backoff if absent |
| 503           | Service unavailable                      | Yes    | Exponential backoff with jitter                             |
| 502           | Bad gateway                              | Yes    | Exponential backoff with jitter                             |
| 5xx (other)   | Server error                             | No     | Return 502 to frontend                                      |
| 4xx           | Client error                             | No     | Forward to frontend with appropriate mapping                |
| Network error | Connection refused, DNS failure, timeout | Yes    | Exponential backoff with jitter                             |

**Retry parameters:**

- Max retries: 3
- Initial delay: 200ms
- Max delay: 5s
- Backoff multiplier: 2
- Jitter: +/- 25%

### Circuit breaker

After consecutive failures exceed a threshold, the API container stops calling the agent and returns 503 directly:

- **Failure threshold:** 5 consecutive failures
- **Cooldown period:** 30 seconds
- **Half-open:** After cooldown, allow one request through. If it succeeds, close the circuit. If it fails, reopen.

### Timeouts

| Request type                  | Timeout                      | Notes                                                                                     |
|-------------------------------|------------------------------|-------------------------------------------------------------------------------------------|
| Non-streaming (JSON response) | 30 seconds                   | Includes LLM generation time                                                              |
| Streaming (SSE connection)    | No timeout on the connection | Individual events should arrive within 60s; if no event for 60s, treat as dead connection |
| Health check                  | 5 seconds                    | Fast fail for readiness probes                                                            |

### Error mapping

The API container maps agent errors to frontend-appropriate responses:

| Agent response     | API response to frontend | Notes                               |
|--------------------|--------------------------|-------------------------------------|
| 400 Bad Request    | 400 Bad Request          | Pass through — invalid input        |
| 401 Unauthorized   | 502 Bad Gateway          | Auth failure is an internal concern |
| 404 Not Found      | 404 Not Found            | Conversation doesn't exist          |
| 429 Rate Limited   | 429 Rate Limited         | Pass through with `Retry-After`     |
| 500 Internal Error | 502 Bad Gateway          | Agent internal failure              |
| 503 Unavailable    | 503 Service Unavailable  | Agent is down                       |
| Network error      | 502 Bad Gateway          | Agent unreachable                   |

## SSE Streaming Passthrough

When the frontend requests streaming (`Accept: text/event-stream`), the API container:

1. Opens an SSE connection to the agent container (`POST /conversations/{id}/messages` with `Accept: text/event-stream`)
1. Forwards each SSE event from the agent to the frontend as-is (same event names, same data format)
1. If the agent SSE connection drops unexpectedly, sends an `error` event to the frontend and closes the connection:

   ```text
   event: error
   data: {"code": "agent_connection_lost", "message": "Connection to agent was interrupted"}
   ```

1. If the frontend disconnects, the API container closes its connection to the agent (abort the upstream request)

### Event passthrough

The API container does **not** modify SSE event data. Events are forwarded verbatim:

- `message.delta` — token chunk
- `message.complete` — full response with usage stats
- `activity.resolved` — specialist called its resolution tool; carries structured outcome data
- `tool.called` — specialist agent-tool invoked (OpenAI variant only); payload: `{ toolName: string }`
- `tool.done` — specialist agent-tool completed (OpenAI variant only); payload: `{ toolName: string }`
- `error` — generation error

The `tool.called`/`tool.done` events are emitted only for specialist tools (`shanty_specialist`, `treasure_specialist`, `crew_specialist`), not for resolution tools. The frontend uses them to show specialist-specific loading text (e.g., "The shanty specialist is working...").

The only exception is when the API container itself encounters an error (e.g., agent connection lost), in which case it generates its own `error` event.

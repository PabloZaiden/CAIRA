# Agent API contract

The API implementations in this folder expose the same agent container surface. The code is the source of truth; this file summarizes the routes that are implemented by the TypeScript and C# reference APIs.

## Core agent routes

| Method | Path                                            | Purpose                                      |
|--------|-------------------------------------------------|----------------------------------------------|
| `POST` | `/conversations`                                | Create a conversation                        |
| `GET`  | `/conversations`                                | List conversations                           |
| `GET`  | `/conversations/{conversationId}`               | Get one conversation and its messages        |
| `POST` | `/conversations/{conversationId}/messages`      | Send one message, returning JSON or SSE      |
| `GET`  | `/health`                                       | Health check                                 |
| `GET`  | `/metrics`                                      | Prometheus-compatible metrics                |
| `GET`  | `/identity`                                     | Diagnostic Azure credential check            |

`POST /conversations` accepts an optional metadata object:

```json
{
  "metadata": {
    "mode": "discovery"
  }
}
```

It returns `201` with a conversation:

```json
{
  "id": "conversation-id",
  "createdAt": "2026-05-19T12:00:00.000Z",
  "updatedAt": "2026-05-19T12:00:00.000Z",
  "metadata": {
    "mode": "discovery"
  }
}
```

`POST /conversations/{conversationId}/messages` accepts:

```json
{
  "content": "What should I do next?"
}
```

By default it returns JSON with a message:

```json
{
  "id": "message-id",
  "role": "assistant",
  "content": "Agent response text",
  "createdAt": "2026-05-19T12:00:01.000Z",
  "usage": {
    "promptTokens": 42,
    "completionTokens": 128
  }
}
```

When called with `Accept: text/event-stream`, the same endpoint streams Server-Sent Events.

## Activity routes for the React frontend

The React reference frontend uses an activity-oriented API layer implemented by each API container:

| Method | Path                                                       | Purpose                                      |
|--------|------------------------------------------------------------|----------------------------------------------|
| `POST` | `/api/activities/discovery`                                | Start a discovery activity                   |
| `POST` | `/api/activities/planning`                                 | Start a planning activity                    |
| `POST` | `/api/activities/staffing`                                 | Start a staffing activity                    |
| `GET`  | `/api/activities/conversations`                            | List activity conversations                  |
| `GET`  | `/api/activities/conversations/{conversationId}`           | Get activity conversation detail             |
| `POST` | `/api/activities/conversations/{conversationId}/messages`  | Send one activity message, JSON or SSE       |
| `GET`  | `/api/activities/stats`                                    | Return activity statistics                   |
| `GET`  | `/health/deep`                                             | Health check including agent runtime status  |

Activity message requests use `message` rather than `content`:

```json
{
  "message": "What should I do next?"
}
```


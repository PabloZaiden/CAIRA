# Minimal conversational API contract

The React reference frontend expects one API container with these endpoints:

| Method | Path      | Purpose                       |
|--------|-----------|-------------------------------|
| `GET`  | `/health` | Liveness check for the API    |
| `POST` | `/chat`   | Send one user message to the agent-backed API |

`POST /chat` accepts:

```json
{
  "message": "What should I do next?",
  "conversationId": "optional-client-id"
}
```

It returns:

```json
{
  "conversationId": "optional-client-id",
  "reply": "Agent response text",
  "model": "model-or-agent-name-used"
}
```

Each API implementation is intentionally independent. Keep the contract small so agents can copy only the stack that fits a user's scenario.

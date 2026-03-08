# Adding New Components

This guide explains how to add new agent frameworks, languages, compute targets, or other component types to the project.

## The component model

Every component lives under `components/` and follows this convention:

```text
components/<type>/<language>/<variant>/
```

Where:

- **type**: `agent`, `api`, `frontend`, `iac`
- **language**: `typescript`, `csharp`, `python`
- **variant**: framework or implementation name (e.g., `foundry-agent-service`, `openai-agent-sdk`)

Each component is **fully self-contained** with its own:

- `package.json` (or equivalent for other languages)
- `tsconfig.json` (or equivalent)
- `Dockerfile`
- `component.json` manifest
- `src/` and `tests/` directories

---

## Adding a new agent framework

This is the most common extension. To add a new agent framework (e.g., Microsoft Agent Framework, LangChain, Semantic Kernel):

### 1. Create the component directory

```text
components/agent/typescript/<framework-name>/
```

### 2. Create `component.json`

```json
{
  "name": "agent",
  "type": "agent",
  "variant": "<framework-name>",
  "language": "typescript",
  "description": "Agent container using <Framework Name>",
  "port": 3000,
  "healthEndpoint": "/health",
  "requiredEnv": ["<REQUIRED_ENV_VARS>"],
  "optionalEnv": ["PORT", "HOST", "LOG_LEVEL", "SKIP_AUTH"],
  "contractSpec": "contracts/agent-api.openapi.yaml"
}
```

### 3. Implement the agent API contract

Your agent must implement all endpoints from `contracts/agent-api.openapi.yaml`:

| Endpoint                                   | Method | Must implement                      |
|--------------------------------------------|--------|-------------------------------------|
| `/conversations`                           | POST   | Create a new conversation           |
| `/conversations`                           | GET    | List conversations (paginated)      |
| `/conversations/{conversationId}`          | GET    | Get conversation with messages      |
| `/conversations/{conversationId}/messages` | POST   | Send message (SSE and JSON)         |
| `/health`                                  | GET    | Health check with dependency status |
| `/metrics`                                 | GET    | Prometheus-compatible metrics       |

### 4. Follow the existing architecture pattern

Use the existing agent variants as templates. The recommended file structure:

```text
src/
├── server.ts           # Entry point + graceful shutdown
├── app.ts              # Fastify factory (testable without starting listener)
├── config.ts           # Environment variable loading
├── <sdk>-client.ts     # SDK wrapper with conversation model mapping
├── routes.ts           # Route handlers
└── types.ts            # Types matching agent-api.openapi.yaml
```

Key requirements:

- **`app.ts` must be importable for testing** -- use `buildApp()` pattern with injectable dependencies
- **Auth hook:** Check `Authorization: Bearer <token>` unless `SKIP_AUTH=true`
- **SSE streaming:** Use `reply.hijack()` and write SSE events directly to `reply.raw`
- **SSE format must match exactly:** `event: message.delta\ndata: {"content": "..."}\n\n`
- **Health check must report dependency status**
- **DefaultAzureCredential for auth** -- no API keys

### 5. Write tests

Target >80% code coverage with three test files:

- `tests/config.test.ts` -- config loading, defaults, missing required vars
- `tests/<sdk>-client.test.ts` -- conversation CRUD, messaging, streaming (mock the SDK)
- `tests/routes.test.ts` -- HTTP endpoints, auth, errors, SSE format

### 6. Create the Dockerfile

Follow the multi-stage pattern:

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

### 7. Extend the unified mock (if needed)

All mock infrastructure lives in a single unified mock at `testing/mocks/ai-mock/`. If the new agent framework uses a different API surface than the existing Foundry Agent CRUD and OpenAI Responses APIs, extend `ai-mock` with new routes rather than creating a separate mock.

```text
testing/mocks/ai-mock/
├── src/
│   ├── server.ts           # Fastify entry point
│   ├── routes.ts           # Route registration (add new API surfaces here)
│   ├── store.ts            # In-memory state
│   └── types.ts            # Type definitions
├── tests/
├── Dockerfile
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

The mock must remain:

- **Deterministic** -- same input, same output
- **Auth-aware** -- accept bearer tokens but don't validate
- **Docker-ready** -- single container serving all API surfaces on port 8100

### 8. Verify

Run the full verification checklist:

```bash
cd components/agent/typescript/<framework-name>

# 1. Unit tests pass
npm run test

# 2. Zero lint errors
npm run lint

# 3. Zero type errors
npm run typecheck

# 4. Contract compliance (requires running instance + mock)
# Start your agent against the mock, then:
cd testing/contract-validator
npx tsx src/cli.ts --spec ../../contracts/agent-api.openapi.yaml --url http://localhost:3000

# 5. Container builds and health check works
docker build -t caira-agent-<framework> .
docker run -p 3000:3000 -e <REQUIRED_ENV>=<value> -e SKIP_AUTH=true caira-agent-<framework>
curl http://localhost:3000/health
```

### 9. Regenerate deployment strategies

After adding a new component, regenerate the committed deployment strategies so the generator picks up the new combination:

```bash
# Regenerate all deployment strategies (new valid combinations will be committed automatically)
node scripts/generate-strategies.ts

# Verify no drift
node scripts/validate-strategies.ts
```

The generator automatically discovers new components via their `component.json` manifest, builds the combination matrix, and produces a new sample if all required components exist (agent + API + frontend for the same language). No changes to the generator code are needed.

---

## Adding a new language

To add a new language (e.g., Python) for an existing component type (C# has already been added — see `components/agent/csharp/` and `components/api/csharp/`):

### 1. Create the component

```text
components/agent/<language>/<framework>/
components/api/<language>/
```

### 2. Match the existing API contract exactly

The new language implementation must conform to the same OpenAPI spec. Same endpoints, same request/response schemas, same SSE event format.

### 3. Use language-appropriate tooling

Each language has its own conventions:

- **Python**: `uv` for package management (no pip/venv), `pytest` for tests, `pyproject.toml`
- **C#**: .NET SDK 10, NUnit/xUnit for tests, `.csproj`

### 4. Same Dockerfile pattern

Multi-stage build with the language's standard base image.

### 5. Same `component.json` schema

The manifest format is language-agnostic:

```json
{
  "name": "agent",
  "type": "agent",
  "variant": "<framework>",
  "language": "<language>",
  "description": "...",
  "port": 3000,
  "healthEndpoint": "/health",
  "requiredEnv": ["..."],
  "contractSpec": "contracts/agent-api.openapi.yaml"
}
```

---

## Adding a new compute target

To add support for a different compute target (e.g., AKS, App Service):

### 1. Create IaC component

```text
components/iac/<compute-target>/
├── main.tf
├── variables.tf
├── outputs.tf
├── testing_overlay.tf    # Optional test-only resources; stays top-level for Terraform loading
├── testing_variables.tf  # Optional test-only inputs
├── testing_outputs.tf    # Optional test-only outputs
├── providers.tf
├── versions.tf
├── testing_overlay/      # Optional test-only assets (cloud-init, scripts, fixtures)
│   └── testing_jumpbox.cloud-init.yaml.tftpl
├── config/             # Deployment strategy tfvars
│   ├── basic-public.tfvars
│   └── ...
└── component.json
```

Keep test-only Terraform split into the `testing_*` files. Auxiliary test assets
can live under `testing_overlay/`, but the `.tf` file itself must stay at the
module root because Terraform does not load root-module `.tf` files from nested
directories.

### 2. Reference CAIRA modules

Reference the checked-in CAIRA macro reference-architecture and module sources under `strategy-builder/infra/` and `strategy-builder/infra/modules/`. Strategy IaC should stay a thin implementation wrapper over those shared infrastructure contracts instead of redefining the macro infrastructure separately.

### 3. Deployment strategy configs

Each compute target may support different deployment strategies. Create `config/<strategy>.tfvars` files. Use the `caira_strategy` variable to select the CAIRA reference architecture (`basic` or `standard`), and `private_networking` to control network isolation.

### 4. Azure credentials in Docker

For local development, all generated docker-compose.yml files include an **az credential sidecar** (`azcred` service). This is the only container that needs Azure CLI and the `azurecli` Docker volume. App containers get tokens via `IDENTITY_ENDPOINT` + `IMDS_ENDPOINT` env vars.

---

## Adding a new frontend variant

Currently, the frontend is always React/TypeScript. If you need a different frontend:

### 1. Create the component

```text
components/frontend/<variant>/
```

### 2. Same API client contract

The frontend must call the same business API endpoints from `contracts/backend-api.openapi.yaml`.

### 3. Same Docker pattern

Build static files, serve via Fastify BFF on port 8080 (serves SPA + proxies `/api/*` to API container), with `/health` endpoint returning `{"status":"healthy"}`.

---

## Checklist for any new component

- [ ] `component.json` manifest with correct type, variant, language, port, env vars, contract ref
- [ ] Implements the relevant OpenAPI contract exactly
- [ ] Self-contained: own `package.json`, build, and test scripts
- [ ] Extends `tsconfig.base.json` (for TypeScript components)
- [ ] `Dockerfile` with multi-stage build
- [ ] `.dockerignore` excluding `node_modules/`, `tests/`, `coverage/`
- [ ] Unit tests with >80% coverage
- [ ] `npm run test`, `npm run lint`, `npm run typecheck` all pass
- [ ] Docker builds and health endpoint responds
- [ ] Uses `DefaultAzureCredential` for Azure auth (no API keys)
- [ ] `SKIP_AUTH=true` disables auth for local dev/testing
- [ ] Works with the credentials proxy sidecar (`IDENTITY_ENDPOINT` + `IMDS_ENDPOINT`) for Docker-based local dev
- [ ] Deterministic mock available for testing without Azure
- [ ] Deployment strategies regenerated (`task strategy:generate`)
- [ ] Drift validator passes (`task strategy:validate:pr`)

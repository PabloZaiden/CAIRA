# CAIRA Deployment Strategy: C# + Microsoft Agent Framework + ACA

A complete, self-contained deployment strategy for the Foundry Agentic App reference architecture using Azure Container Apps with:

- **Frontend:** React + TypeScript (Vite build, Fastify BFF)
- **API:** C# ASP.NET Core Minimal API
- **Agent:** Agent container using Microsoft Agent Framework workflows

## Architecture

```text
Browser → Frontend (BFF :8080) → API (:4000) → Agent (:3000) → Azure AI
              /api proxy

Credentials Sidecar (:8079) ← azurecli volume ← `az login`
  ↕ IDENTITY_ENDPOINT (agent, api get tokens via HTTP)
```

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose v2
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
- An Azure AI endpoint with a deployed model
- For Azure deployment, an Entra tenant role or delegated permission set that can:
  - create application registrations
  - create corresponding service principals
  - create app-role assignments between the frontend and API identities, and between the API and agent identities

## Quick Start

1. Create the `azurecli` Docker volume and log in to Azure:

   ```bash
   docker volume create azurecli
   docker run -it --rm -v azurecli:/root/.azure mcr.microsoft.com/azure-cli az login --use-device-code
   ```

1. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

1. Edit `.env` with your Azure endpoint:

   ```text
   AZURE_OPENAI_ENDPOINT=https://<your-resource>...
   ```

1. Start the stack:

   ```bash
   docker compose up --build
   ```

1. Open <http://localhost:8080> in your browser.

1. Verify credentials are working:

   ```bash
   curl http://localhost:3000/identity
   curl http://localhost:4000/identity
   ```

To stop:

```bash
docker compose down
```

## Deploy to Azure

This deployment strategy includes Terraform IaC under `infra/` and can be deployed from the
repository root with:

```bash
task strategy:deploy -- deployment-strategies/foundry_agentic_app/csharp-microsoft-agent-framework-aca
```

The deploy command:

- Deploys the layered CAIRA foundation (Foundry foundation + composable app-infra layers) and writes strategy `.env` values automatically
- Detects your current IP via `curl ifconfig.io`
- Restricts frontend ingress to that single CIDR
- Creates the layered Azure AI + Container Registry + Container Apps infrastructure with Terraform
- Rolls out bootstrap app shells first, then updates them to the strategy images
- Uses managed identity auth for Container Apps image pulls from ACR
- Creates required role assignments (AcrPull + Azure AI roles for the agent)
- Creates Entra application registrations, service principals, and app-role assignments for the internal frontend -> API -> agent token flow
- Exposes frontend via HTTPS termination (container still serves HTTP internally)
- Builds/pushes images and updates the deployment

If the deployment identity can create app registrations but **cannot** create the matching service principals or app-role assignments, Terraform can fail with `403 Authorization_RequestDenied`. In that state, the container apps may still deploy, but internal token acquisition can later fail with `AADSTS500011` because the API or agent resource principal does not exist in the tenant.

To tear down:

```bash
task strategy:destroy -- deployment-strategies/foundry_agentic_app/csharp-microsoft-agent-framework-aca
```

## Optional APIM AI Gateway

This strategy can optionally deploy Azure API Management in front of the
Foundry OpenAI-style chat completions endpoint:

- disabled by default
- enable with `enable_apim_ai_gateway = true`
- defaults to the `Developer_1` SKU unless you override `apim_sku_name`
- intended for optional governance, observability, and policy enforcement

When enabled, Terraform outputs expose:

- `apim_gateway_name`
- `apim_gateway_url`
- `apim_openai_api_base_url`
- `apim_chat_completions_url_template`

When the gateway is enabled in Azure deployments, the OpenAI-compatible agent container automatically points `AZURE_OPENAI_ENDPOINT` at `apim_gateway_url`, so model traffic flows through APIM without runtime branching in the app. Use `apim_openai_api_base_url` or `apim_chat_completions_url_template` for manual REST callers.

Treat the gateway as an optional preview-shaped integration layer and validate
the policies you need before using it in a real environment.

## Services

| Service             | Port | Health Check | Description                                                               |
|---------------------|------|--------------|---------------------------------------------------------------------------|
| Credentials Sidecar | 8079 | `/health`    | Serves Azure CLI tokens to containers via IDENTITY_ENDPOINT               |
| Frontend            | 8080 | `/health`    | React SPA + BFF (proxies /api to API service)                             |
| API                 | 4000 | `/health`    | Business API (routes, conversation management)                            |
| Agent               | 3000 | `/health`    | Agent container using Microsoft Agent Framework mode-specific workflows   |

## Project Structure

```text
deployment-strategies/foundry_agentic_app/csharp-microsoft-agent-framework-aca/
├── agent/              # Agent service source code
├── api/                # Business API source code
├── azcred/             # Az credential sidecar (serves tokens via HTTP)
├── frontend/           # React frontend + BFF server source code
├── infra/              # Terraform for the app-platform deployment
├── contracts/          # OpenAPI specifications
├── docker-compose.yml  # Local development compose
├── .env.example        # Environment variable template
├── strategy.provenance.json # Strategy metadata/provenance
└── README.md           # This file
```

## Environment Variables

### Required

| Variable                | Description                                                                                                 |
|-------------------------|-------------------------------------------------------------------------------------------------------------|
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint or APIM gateway URL for SDK-based callers (e.g., https://<resource>.openai.azure.com) |

### Optional

| Variable                                | Default              | Description                                             |
|-----------------------------------------|----------------------|---------------------------------------------------------|
| `AZURE_OPENAI_API_VERSION`              | `2025-03-01-preview` | API version (default: 2025-03-01-preview)               |
| `AGENT_MODEL`                           | `gpt-5.2-chat`       | Model deployment name (default: gpt-5.2-chat)           |
| `AGENT_NAME`                            | ``                   | Agent display name                                      |
| `CAPTAIN_INSTRUCTIONS`                  | ``                   | Shared system prompt applied to all specialists         |
| `SHANTY_INSTRUCTIONS`                   | ``                   | System prompt for opportunity discovery specialist      |
| `TREASURE_INSTRUCTIONS`                 | ``                   | System prompt for account planning specialist           |
| `CREW_INSTRUCTIONS`                     | ``                   | System prompt for account-team staffing specialist      |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | ``                   | Optional App Insights connection string for OTEL export |
| `LOG_LEVEL`                             | `debug`              | Log level: trace, debug, info, warn, error, fatal       |

### Service-to-service auth

The local and Azure deployment paths now use the same **Entra-issued access token** contract between services:

- **Frontend BFF -> API** requests use `API_TOKEN_SCOPE` to request a token for the API audience.
- **API -> agent** requests use `AGENT_TOKEN_SCOPE` to request a token for the agent audience.
- **API inbound validation** checks signature/JWKS, issuer, audience, expiry, and optional caller application IDs using:
  - `INBOUND_AUTH_TENANT_ID`
  - `INBOUND_AUTH_ALLOWED_AUDIENCES`
  - `INBOUND_AUTH_ALLOWED_CALLER_APP_IDS`
  - `INBOUND_AUTH_AUTHORITY_HOST`
- **Agent inbound validation** uses the same validator inputs.

For local mock/dev, `SKIP_AUTH=true` is the explicit bypass. That bypass is only for local sample flows; it is not the recommended Azure posture.

### Microsoft Agent Framework implementation note

This strategy's C# agent is **not** implemented as the same captain/triage pattern used by the TypeScript variants.

- It builds **one workflow per mode** (`shanty`, `treasure`, `crew`)
- It chooses the workflow from conversation metadata
- It applies the shared `CAPTAIN_INSTRUCTIONS` text to each specialist prompt, but **does not run a separate captain runtime agent**

That keeps the HTTP contract equivalent while making the orchestration pattern honestly different.

## Production posture

This strategy already includes:

- managed-identity-friendly credential flow
- explicit inter-service token audiences/scopes
- JWT validation at the API and agent layers
- optional APIM / AI gateway and private-networking-aligned infrastructure slices
- observability wiring points through Application Insights / OTEL

This strategy still leaves downstream production work to you, including:

- workload-specific RBAC review and conditional access
- environment-specific network controls and segmentation
- backup/DR and data protection controls
- operational alerting, incident response, and compliance processes

Treat the local compose stack, local validation, sample Azure deployment, and production rollout as distinct stages rather than the same trust level.

## Troubleshooting

### Containers fail to start

Check build logs: `docker compose logs <service-name>`

### Health checks failing

Services have a 10s start period. If builds are slow, wait or increase timeout.

### Port conflicts

If ports 3000, 4000, or 8080 are in use, stop the conflicting service or modify the port mappings in `docker-compose.yml`.

## Authentication

This deployment strategy uses a **runtime-appropriate Azure credential** for outbound token acquisition.

### Setup

```bash
# Create the Docker volume and log in (one-time)
docker volume create azurecli
docker run -it --rm -v azurecli:/root/.azure mcr.microsoft.com/azure-cli az login --use-device-code
```

### Verify

```bash
# Check which identity is being used
curl http://localhost:3000/identity
curl http://localhost:4000/identity
```

### How it works

The az credential sidecar mounts the `azurecli` Docker volume (containing your Azure CLI
token cache) and serves tokens via HTTP. App containers use the managed-identity-style
`IDENTITY_ENDPOINT` contract directly, so local compose still exercises the same token
request shape as Azure.

For Azure Container Apps deployments, the same helper uses the platform-provided managed
identity endpoint and header. The remaining deployment prerequisite is tenant-side Entra
permission to create the API and agent service principals and their app-role assignments.

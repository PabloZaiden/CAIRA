# CAIRA Deployment Strategy: TypeScript + Foundry Agent Service + ACA

A complete, self-contained deployment strategy for the Foundry Agentic App reference architecture using Azure Container Apps with:

- **Frontend:** React + TypeScript (Vite build, Fastify BFF)
- **API:** TypeScript Fastify business API
- **Agent:** Agent container using Azure AI Foundry (AI Projects v2 SDK)

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
   AZURE_AI_PROJECT_ENDPOINT=https://<your-resource>...
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
task strategy:deploy -- deployment-strategies/foundry_agentic_app/typescript-foundry-agent-service-aca
```

The deploy command:

- Deploys the layered CAIRA foundation (Foundry foundation + composable app-infra layers) and writes strategy `.env` values automatically
- Detects your current IP via `curl ifconfig.io`
- Restricts frontend ingress to that single CIDR
- Creates the layered Azure AI + Container Registry + Container Apps infrastructure with Terraform
- Rolls out bootstrap app shells first, then updates them to the strategy images
- Uses managed identity auth for Container Apps image pulls from ACR
- Creates required role assignments (AcrPull + Azure AI roles for the agent)
- Exposes frontend via HTTPS termination (container still serves HTTP internally)
- Builds/pushes images and updates the deployment

To tear down:

```bash
task strategy:destroy -- deployment-strategies/foundry_agentic_app/typescript-foundry-agent-service-aca
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

The Foundry Agent Service variant keeps using `AZURE_AI_PROJECT_ENDPOINT` directly. When the gateway is enabled, the APIM outputs are available for external OpenAI-style callers or custom integrations.

Treat the gateway as an optional preview-shaped integration layer and validate
the policies you need before using it in a real environment.

## Services

| Service             | Port | Health Check | Description                                                 |
|---------------------|------|--------------|-------------------------------------------------------------|
| Credentials Sidecar | 8079 | `/health`    | Serves Azure CLI tokens to containers via IDENTITY_ENDPOINT |
| Frontend            | 8080 | `/health`    | React SPA + BFF (proxies /api to API service)               |
| API                 | 4000 | `/health`    | Business API (routes, conversation management)              |
| Agent               | 3000 | `/health`    | Agent container using Azure AI Foundry (AI Projects v2 SDK) |

## Project Structure

```text
deployment-strategies/foundry_agentic_app/typescript-foundry-agent-service-aca/
├── agent/              # Agent service source code
├── api/                # Business API source code
├── azcred/             # Az credential sidecar (serves tokens via HTTP)
├── frontend/           # React frontend + BFF server source code
├── infra/              # Terraform for the app-platform deployment
├── contracts/          # OpenAPI specifications
├── docker-compose.yml  # Local development compose
├── .env.example        # Environment variable template
├── tsconfig.base.json  # Shared TypeScript configuration
├── strategy.provenance.json # Strategy metadata/provenance
└── README.md           # This file
```

## Environment Variables

### Required

| Variable                    | Description                                                                                               |
|-----------------------------|-----------------------------------------------------------------------------------------------------------|
| `AZURE_AI_PROJECT_ENDPOINT` | Azure AI Foundry project endpoint (e.g., https://<resource>.services.ai.azure.com/api/projects/<project>) |

### Optional

| Variable                                | Default        | Description                                             |
|-----------------------------------------|----------------|---------------------------------------------------------|
| `AGENT_MODEL`                           | `gpt-5.2-chat` | Model deployment name (default: gpt-5.2-chat)           |
| `AGENT_NAME`                            | ``             | Agent display name                                      |
| `CAPTAIN_INSTRUCTIONS`                  | ``             | Shared system prompt applied to all specialists         |
| `TRIAGE_INSTRUCTIONS`                   | ``             | Legacy alias for the shared system prompt               |
| `SHANTY_INSTRUCTIONS`                   | ``             | System prompt for shanty battle specialist              |
| `TREASURE_INSTRUCTIONS`                 | ``             | System prompt for treasure hunt specialist              |
| `CREW_INSTRUCTIONS`                     | ``             | System prompt for crew interview specialist             |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | ``             | Optional App Insights connection string for OTEL export |
| `LOG_LEVEL`                             | `debug`        | Log level: trace, debug, info, warn, error, fatal       |

## Troubleshooting

### Containers fail to start

Check build logs: `docker compose logs <service-name>`

### Health checks failing

Services have a 10s start period. If builds are slow, wait or increase timeout.

### Port conflicts

If ports 3000, 4000, or 8080 are in use, stop the conflicting service or modify the port mappings in `docker-compose.yml`.

## Authentication

This deployment strategy uses `DefaultAzureCredential` for Azure authentication. Credentials are provided
to containers via the **az credential sidecar** — a TypeScript HTTP server that
serves Azure CLI tokens to app containers.

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
token cache) and serves tokens via HTTP. App containers set `IDENTITY_ENDPOINT` and
`IMDS_ENDPOINT` environment variables, which `DefaultAzureCredential`'s
`ManagedIdentityCredential` chain detects automatically.

For production deployments on Azure Container Apps, real managed identity is used instead.

# Foundry Agentic App Reference Architecture Sample

This sample is the default CAIRA reference architecture. It keeps the default experience simple: one Azure AI Foundry account, one project, public networking, and a composable application layer built from small Azure Container Registry, Container Apps environment, and per-service Container App modules.

## What this sample is for

- It is the default reference sample the CAIRA skill should inspect first.
- It shows the macro system shape without hiding everything behind a single god-module.
- It keeps advanced capability-host, extra-project, and private-networking changes out of the default path.

## Layered composition

- `main.tf` composes the Foundry foundation (`ai_foundry`, `ai_foundry_project`) and the shared naming/resource-group pieces.
- `application_platform.tf` adds the composable app-platform foundation (`container_registry`, `container_apps_environment`).
- `agent_service.tf`, `api_service.tf`, and `frontend_service.tf` keep each application surface as its own layer.
- `dependant_resources.tf` adds the shared observability resources used by the Foundry account and Container Apps environment.
- `testing_overlay.tf`, `testing_variables.tf`, and `testing_outputs.tf` isolate deployed-validation-only overlay resources, inputs, and outputs; auxiliary test assets live under `testing_overlay/`.
- `infra/modules/` keeps the reusable Terraform modules small and composable.

## Quick start

```bash
cd infra/foundry_agentic_app
terraform init
terraform plan
terraform apply
```

## Architecture

![Foundry Agentic App architecture](./images/architecture.drawio.svg)

## Adaptation patterns

### Agent only

Keep `application_platform.tf` and `agent_service.tf`, then remove the API/frontend service files and the matching outputs you no longer need.

### Agent + API without UI

Keep `application_platform.tf`, `agent_service.tf`, and `api_service.tf`, then remove `frontend_service.tf` plus the `frontend_url` output.

### Merge API behavior into another backend

If another backend owns the API role, remove `api_service.tf` and point `API_BASE_URL` in `frontend_service.tf` at the backend you keep (for example `module.agent_app.url` or an external URL).

## Advanced scenarios

### Capability hosts

Only add capability-host resources when the user scenario actually needs Foundry agent-service connections. In that case:

- create the required capability-host resources with the existing helper modules under `infra/modules/`
- set `enable_agents_capability_host = true` on the `foundry` module
- pass `agent_capability_host_connections` into the project module that should use them

Keep that guidance in the skill or derived implementation rather than bloating the default sample. See <https://learn.microsoft.com/azure/foundry/agents/concepts/capability-hosts>.

### Private networking

The sample Terraform files show the exact fields to change for private networking:

- add `foundry_subnet_id` to the `foundry` module in `main.tf`
- add `infrastructure_subnet_id` to `container_apps_environment` in `application_platform.tf`
- keep the frontend ingress VNet-reachable in `frontend_service.tf` with `external_enabled = true` and `allowed_cidrs = []`; when the Container Apps environment itself is internal-only, that still keeps the app private to the VNet

See <https://learn.microsoft.com/azure/foundry/agents/how-to/virtual-networks> for the Azure networking guidance.

### Secondary project

If you need another Foundry project, start from the commented `secondary_project` block in `main.tf` instead of making the default sample carry that complexity all the time.

## Relationship to deployment strategies

Deployment strategies are implementations of the same macro architecture. They should reuse the same layered CAIRA infrastructure model and only vary the application implementation details, framework choices, images, and configuration.

<!-- BEGIN_TF_DOCS -->

<!-- END_TF_DOCS -->

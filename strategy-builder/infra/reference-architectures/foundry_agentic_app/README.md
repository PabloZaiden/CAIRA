# Foundry Agentic App Reference Architecture Sample

This sample is the default CAIRA reference architecture. It keeps the default experience simple: one Azure AI Foundry account, one project, public networking, and a composable application layer built from small Azure Container Registry, Container Apps environment, and per-service Container App modules.

## What this sample is for

- It is the default reference sample the CAIRA skill should inspect first.
- It shows the macro system shape without hiding everything behind a single god-module.
- It keeps advanced capability-host, extra-project, and private-networking changes out of the default path while showing the AVM inputs agents should use when they need those variants.

## Layered composition

- `main.tf` composes the Foundry foundation with the Azure AI Foundry AVM and the shared naming/resource-group pieces.
- `application_platform.tf` adds the composable app-platform foundation (`container_registry`, `container_apps_environment`).
- `agent_service.tf`, `api_service.tf`, and `frontend_service.tf` keep each application surface as its own layer.
- `dependant_resources.tf` adds the shared observability resources used by the Foundry account and Container Apps environment.
- `testing_overlay.tf`, `testing_variables.tf`, and `testing_outputs.tf` isolate deployed-validation-only overlay resources, inputs, and outputs; auxiliary test assets live under `testing_overlay/`.
- `strategy-builder/infra/modules/` keeps the reusable Terraform modules small and composable.

## Quick start

```bash
cd strategy-builder/infra/reference-architectures/foundry_agentic_app
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

### Foundry deployment scenarios

#### `basic_public`

This is the default sample shape. The `foundry` AVM module creates one Foundry account, one `default-project`, and the shared model deployments. It keeps Foundry public, does not create or connect Cosmos DB/Storage/Search, and keeps Application Insights connected through the small root-level `appinsights_connection` resource.

#### `basic_private`

Use the same AVM module shape, then enable private endpoints and pass the private endpoint subnet plus Foundry private DNS zones:

```hcl
create_private_endpoints            = true
private_endpoint_subnet_resource_id = <private-endpoint-subnet-id>

ai_foundry = {
  private_dns_zone_resource_ids = [
    <privatelink.openai.azure.com-zone-id>,
    <privatelink.cognitiveservices.azure.com-zone-id>,
    <privatelink.services.ai.azure.com-zone-id>
  ]
}
```

For the app layer, keep using `infrastructure_subnet_id` on `container_apps_environment`. Keep the frontend ingress VNet-reachable with `external_enabled = true` and `allowed_cidrs = []`; when the Container Apps environment is internal-only, the app remains private to the VNet.

#### `standard_private`

Use `basic_private`, then enable the private agent-service path and project connections. The BYOR-style reference is the primary pattern: provide existing Cosmos DB, Storage Account, and AI Search resource IDs directly on the AVM project connection fields.

```hcl
ai_foundry = {
  create_ai_agent_service = true
  network_injections = [{
    scenario                   = "agent"
    subnetArmId                = <agents-subnet-id>
    useMicrosoftManagedNetwork = false
  }]
}

ai_projects = {
  default = {
    name                       = "default-project"
    display_name               = "Default Project"
    description                = "Default Project description"
    create_project_connections = true
    cosmos_db_connection       = { existing_resource_id = <cosmos-db-account-id> }
    ai_search_connection       = { existing_resource_id = <ai-search-id> }
    storage_account_connection = { existing_resource_id = <storage-account-id> }
  }
}
```

If you want the AVM to create those dependent resources instead, set `create_byor = true`, populate `cosmosdb_definition`, `storage_account_definition`, and `ai_search_definition`, then point each project connection at the matching `new_resource_map_key`.

See <https://learn.microsoft.com/azure/foundry/agents/how-to/virtual-networks> for the Azure networking guidance.

### Secondary project

If you need another Foundry project, add another entry to the AVM `ai_projects` map instead of making the default sample carry that complexity all the time.

## Relationship to deployment strategies

Deployment strategies are implementations of the same macro architecture. They should reuse the same layered CAIRA infrastructure model and only vary the application implementation details, framework choices, images, and configuration.

<!-- BEGIN_TF_DOCS -->

<!-- END_TF_DOCS -->

resource "azurerm_log_analytics_workspace" "this" {
  location            = var.location
  name                = module.naming.log_analytics_workspace.name_unique
  resource_group_name = local.resource_group_name
  retention_in_days   = 30
  sku                 = "PerGB2018"
  tags                = var.tags
}

module "application_insights" {
  source  = "Azure/avm-res-insights-component/azurerm"
  version = "0.2.0"

  location            = var.location
  name                = module.naming.application_insights.name_unique
  resource_group_name = local.resource_group_name
  workspace_id        = azurerm_log_analytics_workspace.this.id
  enable_telemetry    = var.enable_telemetry
  application_type    = "other"
  tags                = var.tags
}

locals {
  app_common_env = {
    APPLICATIONINSIGHTS_CONNECTION_STRING = module.application_insights.connection_string
  }

  apim_sdk_openai_endpoint = var.enable_apim_ai_gateway ? trimsuffix(azurerm_api_management.ai_gateway[0].gateway_url, "/") : null
  apim_openai_backend_url  = "https://${module.foundry.ai_foundry_name}.openai.azure.com/openai"

  agent_openai_endpoint_env = var.enable_apim_ai_gateway && contains(keys(var.agent_env), "AZURE_OPENAI_ENDPOINT") ? {
    AZURE_OPENAI_ENDPOINT = local.apim_sdk_openai_endpoint
  } : {}
}

resource "azurerm_api_management" "ai_gateway" {
  count = var.enable_apim_ai_gateway ? 1 : 0

  name                = substr(replace("${local.base_name}-${random_string.app_suffix.result}-apim", "-", ""), 0, 50)
  location            = var.location
  resource_group_name = local.resource_group_name
  publisher_name      = "CAIRA"
  publisher_email     = "caira@example.com"
  sku_name            = var.apim_sku_name
  tags                = var.tags

  identity {
    type = "SystemAssigned"
  }
}

resource "azurerm_role_assignment" "ai_gateway_foundry_user" {
  count = var.enable_apim_ai_gateway ? 1 : 0

  scope                            = module.foundry.ai_foundry_id
  role_definition_name             = "Cognitive Services OpenAI User"
  principal_id                     = azurerm_api_management.ai_gateway[0].identity[0].principal_id
  skip_service_principal_aad_check = true
}

resource "azurerm_api_management_backend" "foundry_openai" {
  count = var.enable_apim_ai_gateway ? 1 : 0

  name                = "foundry-openai"
  resource_group_name = local.resource_group_name
  api_management_name = azurerm_api_management.ai_gateway[0].name
  protocol            = "http"
  url                 = local.apim_openai_backend_url
  title               = "Foundry OpenAI backend"
  description         = "Optional AI gateway backend for Foundry OpenAI-style endpoints."
}

resource "azurerm_api_management_api" "foundry_openai" {
  count = var.enable_apim_ai_gateway ? 1 : 0

  name                  = "foundry-openai"
  resource_group_name   = local.resource_group_name
  api_management_name   = azurerm_api_management.ai_gateway[0].name
  revision              = "1"
  display_name          = "Foundry OpenAI Gateway"
  path                  = "openai"
  protocols             = ["https"]
  service_url           = local.apim_openai_backend_url
  subscription_required = false
}

resource "azurerm_api_management_api_operation" "foundry_proxy_post" {
  count = var.enable_apim_ai_gateway ? 1 : 0

  operation_id        = "proxy-post"
  api_name            = azurerm_api_management_api.foundry_openai[0].name
  api_management_name = azurerm_api_management.ai_gateway[0].name
  resource_group_name = local.resource_group_name
  display_name        = "OpenAI POST Proxy"
  method              = "POST"
  url_template        = "/*"
}

resource "azurerm_api_management_api_operation" "foundry_proxy_get" {
  count = var.enable_apim_ai_gateway ? 1 : 0

  operation_id        = "proxy-get"
  api_name            = azurerm_api_management_api.foundry_openai[0].name
  api_management_name = azurerm_api_management.ai_gateway[0].name
  resource_group_name = local.resource_group_name
  display_name        = "OpenAI GET Proxy"
  method              = "GET"
  url_template        = "/*"
}

resource "azurerm_api_management_api_operation" "foundry_proxy_delete" {
  count = var.enable_apim_ai_gateway ? 1 : 0

  operation_id        = "proxy-delete"
  api_name            = azurerm_api_management_api.foundry_openai[0].name
  api_management_name = azurerm_api_management.ai_gateway[0].name
  resource_group_name = local.resource_group_name
  display_name        = "OpenAI DELETE Proxy"
  method              = "DELETE"
  url_template        = "/*"
}

resource "azurerm_api_management_api_policy" "foundry_openai" {
  count = var.enable_apim_ai_gateway ? 1 : 0

  api_name            = azurerm_api_management_api.foundry_openai[0].name
  api_management_name = azurerm_api_management.ai_gateway[0].name
  resource_group_name = local.resource_group_name

  xml_content = <<XML
<policies>
  <inbound>
    <base />
    <authentication-managed-identity resource="https://cognitiveservices.azure.com" output-token-variable-name="mi-token" />
    <set-header name="Authorization" exists-action="override">
      <value>@($"Bearer {(string)context.Variables["mi-token"]}")</value>
    </set-header>
    <set-backend-service backend-id="foundry-openai" />
    <llm-emit-token-metric namespace="caira-ai-gateway">
      <dimension name="apiId" value="@(context.Api.Id)" />
      <dimension name="operationId" value="@(context.Operation.Id)" />
    </llm-emit-token-metric>
  </inbound>
  <backend>
    <base />
  </backend>
  <outbound>
    <base />
  </outbound>
  <on-error>
    <base />
  </on-error>
</policies>
XML

  depends_on = [
    azurerm_api_management_backend.foundry_openai,
    azurerm_api_management_api_operation.foundry_proxy_post,
    azurerm_api_management_api_operation.foundry_proxy_get,
    azurerm_api_management_api_operation.foundry_proxy_delete
  ]
}

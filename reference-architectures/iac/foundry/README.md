# Foundry IaC reference

This component deploys the Foundry foundation only: one resource group, one Azure AI Foundry account, one default project, a small set of model deployments, and the observability resources for the Foundry platform.

Foundry diagnostics are sent to a Log Analytics workspace through the Azure Verified Module diagnostic settings, and an Application Insights component is connected to the same workspace for project and application telemetry.

The Application Insights connection must be modeled as a Foundry account-level connection using `Microsoft.CognitiveServices/accounts/connections@2025-06-01`, with `category = "AppInsights"` and `isSharedToAll = true`. Use the Application Insights connection string as `credentials.key`; do not create a separate Application Insights API key for this connection since some subscriptions block Application Insights API key creation.

This account-level connection is separate from diagnostic settings. Diagnostic settings send Foundry resource logs and metrics to Log Analytics, while the `AppInsights` account connection is what makes Application Insights appear connected in Azure AI Foundry/Foundry Portal.

Use its outputs as inputs to an app-hosting component such as `../container-apps`. The app component owns its own managed identities and role assignments so this Foundry component stays reusable.

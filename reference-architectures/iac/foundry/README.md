# Foundry IaC reference

This component deploys the Foundry foundation only: one resource group, one Azure AI Foundry account, one default project, a small set of model deployments, and the observability resources for the Foundry platform.

Foundry diagnostics are sent to a Log Analytics workspace through the Azure Verified Module diagnostic settings, and an Application Insights component is connected to the same workspace for project and application telemetry.

Use its outputs as inputs to an app-hosting component such as `../container-apps`. The app component owns its own managed identities and role assignments so this Foundry component stays reusable.

# Foundry IaC reference

This component deploys the Foundry foundation only: one resource group, one Azure AI Foundry account, one default project, and a small set of model deployments.

Use its outputs as inputs to an app-hosting component such as `../container-apps`. The app component owns its own managed identities and role assignments so this Foundry component stays reusable.

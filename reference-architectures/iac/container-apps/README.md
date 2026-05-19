# Container Apps IaC reference

This component deploys only the application host for two containers:

- `api`
- `frontend`

Pass Foundry values in as variables. This keeps the Foundry platform and app hosting independently reusable and avoids generated deployment-strategy coupling.

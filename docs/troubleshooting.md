# Troubleshooting

## `task validate` fails in a component

Run the component's local command directly from its directory. For example:

```bash
npm run typecheck
terraform validate
dotnet build
```

## Docker build fails

Confirm Docker is running and that the machine can pull base images from public registries.

## Terraform init fails

Confirm network access to provider and module registries. The IaC references use remote Terraform providers and, for Foundry, an Azure Verified Module.

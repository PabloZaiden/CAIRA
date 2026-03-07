# CAIRA File Mapping (Dynamic Discovery)

Discover the current repository structure at execution time instead of maintaining static lists here.

## Canonical discovery endpoints

- Reference architectures: `https://api.github.com/repos/microsoft/CAIRA/contents/infra?ref=<ref>` (inspect directories directly under `infra/`, excluding `modules/` and `testing/`)
- Modules: `https://api.github.com/repos/microsoft/CAIRA/contents/infra/modules?ref=<ref>`
- Strategy builder: `https://api.github.com/repos/microsoft/CAIRA/contents/strategy-builder?ref=<ref>`
- Deployment strategies: `https://api.github.com/repos/microsoft/CAIRA/contents/deployment-strategies?ref=<ref>`
- Docs: `https://api.github.com/repos/microsoft/CAIRA/contents/docs?ref=<ref>`

## File inspection pattern

For each selected reference architecture or deployment strategy:

1. Read its `README.md` for scenario context.
1. Read the Terraform or application files that define behavior.
1. Extract module dependencies from Terraform `source` declarations.
1. Build a capability snapshot from the files that actually exist.

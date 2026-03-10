# CAIRA File Mapping (Dynamic Discovery)

Discover the current repository structure at execution time instead of maintaining static lists here.

## Canonical discovery endpoints

- Reference architectures: `https://api.github.com/repos/microsoft/CAIRA/contents/strategy-builder/infra/reference-architectures?ref=<ref>`
- Modules: `https://api.github.com/repos/microsoft/CAIRA/contents/strategy-builder/infra/modules?ref=<ref>`
- Infra testing: `https://api.github.com/repos/microsoft/CAIRA/contents/strategy-builder/infra/testing?ref=<ref>`
- Strategy builder: `https://api.github.com/repos/microsoft/CAIRA/contents/strategy-builder?ref=<ref>`
- Deployment strategies: `https://api.github.com/repos/microsoft/CAIRA/contents/deployment-strategies?ref=<ref>`
- Docs: `https://api.github.com/repos/microsoft/CAIRA/contents/docs?ref=<ref>`

## File inspection pattern

For each selected reference architecture or deployment strategy:

1. Read its `README.md` for scenario context.
1. Read the Terraform or application files that define behavior.
1. Extract module dependencies from Terraform `source` declarations.
1. Build a capability snapshot from the files that actually exist.

## Reuse rules

- Prefer the smallest architecture slice that satisfies the user's scenario.
- If the user already has some of the platform pieces, map only the missing CAIRA assets into the target solution.
- Exclude internal testing overlay files from normal reuse:
  - `testing_overlay.tf`
  - `testing_variables.tf`
  - `testing_outputs.tf`
- Treat pirate-themed names, prompts, agents, and tools as sample-only artifacts.

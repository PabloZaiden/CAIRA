# CAIRA File Mapping (Dynamic Discovery)

Discover the current repository structure at execution time instead of maintaining static lists here.

Default to `deployment-strategies/` and `docs/` as the main reference entry points. Use `strategy-builder/` only when you need the deeper source-of-truth assets behind those generated strategies or docs.

Use `main` as the default repository ref. Only switch to a specific release tag or other ref when the user explicitly asks for it.

## Canonical discovery endpoints

- Deployment strategies: `https://api.github.com/repos/pablozaiden/CAIRA/contents/deployment-strategies?ref=main`
- Docs: `https://api.github.com/repos/pablozaiden/CAIRA/contents/docs?ref=main`
- Reference architectures: `https://api.github.com/repos/pablozaiden/CAIRA/contents/strategy-builder/infra/reference-architectures?ref=main`
- Modules: `https://api.github.com/repos/pablozaiden/CAIRA/contents/strategy-builder/infra/modules?ref=main`
- Infra testing: `https://api.github.com/repos/pablozaiden/CAIRA/contents/strategy-builder/infra/testing?ref=main`
- Strategy builder: `https://api.github.com/repos/pablozaiden/CAIRA/contents/strategy-builder?ref=main`

## File inspection pattern

For each selected reference architecture or deployment strategy:

1. Start with the nearest generated deployment strategy plus the supporting docs for scenario context.
1. Read its `README.md` and the referenced docs before dropping into lower-level source folders.
1. Read the Terraform or application files that define behavior.
1. Extract module dependencies from Terraform `source` declarations.
1. Build a capability snapshot from the files that actually exist.

## Reuse rules

- Prefer the smallest architecture slice that satisfies the user's scenario.
- If the user already has some of the platform pieces, map only the missing CAIRA assets into the target solution.
- Group files by feature slice before copying. Examples: APIM slice, observability slice, private-networking slice, capability-host slice, agent slice, API slice, frontend slice.
- If a slice is not needed, exclude all of its related files, variables, outputs, env wiring, deploy wiring, and docs from the recommended scope.
- If APIM is needed, include the complete APIM slice rather than only isolated outputs or variables.
- Exclude internal testing overlay files from normal reuse:
  - `testing_overlay.tf`
  - `testing_variables.tf`
  - `testing_outputs.tf`
- Treat pirate-themed names, prompts, agents, and tools as sample-only artifacts.

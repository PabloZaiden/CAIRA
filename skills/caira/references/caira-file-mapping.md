# CAIRA File Mapping (Dynamic Discovery)

Discover the current repository structure at execution time instead of maintaining static lists here.

Default to `deployment-strategies/` and `docs/` as the main reference entry points. Use `strategy-builder/` only when you need the deeper source-of-truth assets behind those generated strategies or docs.

Use `main` as the default discovery ref when browsing CAIRA. If the user chooses `reference` mode for generated dependencies, pin those generated references to a concrete release tag or commit instead of `main`.

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
- Build a per-component decision matrix for app-layer pieces in scope: is the component needed, should it run locally or on hosting, and are its supporting assets already provided or do they need creation?
- For each in-scope app component, clarify whether it should run as a local process, local container, existing hosted service, or newly-created Azure-hosted service.
- If a component should stay local for now, prioritize app code, local configuration, and local run guidance over Azure deployment assets for that component.
- For containerized components, ask whether the user already has a registry to reuse or needs a new registry created.
- Before copying files or converting module sources, ask whether the user wants `copy` mode or `reference` mode.
- For `reference` mode, ask for the preferred CAIRA release, tag, or commit. If none is provided, pin to a concrete ref yourself, preferring a release tag and falling back to a commit SHA.
- Group files by feature slice before copying. Examples: APIM slice, observability slice, private-networking slice, capability-host slice, agent slice, API slice, frontend slice.
- If a slice is not needed, exclude all of its related files, variables, outputs, env wiring, deploy wiring, and docs from the recommended scope.
- If APIM is needed, include the complete APIM slice rather than only isolated outputs or variables.
- Exclude internal testing overlay files from normal reuse:
  - `testing_overlay.tf`
  - `testing_variables.tf`
  - `testing_outputs.tf`
- Treat pirate-themed names, prompts, agents, and tools as sample-only artifacts.

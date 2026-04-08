# Strategy Consumption Modes

Use generated `deployment-strategies/` plus `docs/` as the primary CAIRA reference entry points. Only inspect `strategy-builder/` directly when you need deeper source-of-truth details that are not clear from the generated strategies or the docs.

## Default

Do not assume a mode. Ask the user whether they want `copy` mode (copy the needed CAIRA files/modules into their repo) or `reference` mode (keep a dependency on the CAIRA repo) before generating files.

If the user has no preference, explain the trade-offs and recommend one, but still record the chosen mode explicitly before scaffolding.

Mode selection is separate from runtime selection. Also ask how each in-scope app component should run right now: local-only, existing hosting, or new Azure hosting.

For each needed app component, ask whether the runtime dependencies are already provided or need creation. For containerized components, ask whether to reuse an existing registry or create one.

## `reference` mode

- Keep selected reference architecture files close to the published CAIRA source.
- Ask whether the user has a preferred CAIRA release, tag, or commit.
- Convert local module paths to git module references pinned to a concrete ref.
- If the user has no preference, prefer a release tag. Fall back to a commit SHA from the desired branch when a release tag is not appropriate.
- Do not leave generated references on `main` unless the user explicitly asks for a floating dependency.

Template:

```hcl
source = "git::https://github.com/pablozaiden/CAIRA.git//strategy-builder/infra/modules/<module_name>?ref=<pinned_ref>"
```

## `copy` mode

- Copy the selected architecture files and only the required modules.
- Determine required modules dynamically from Terraform `source` declarations.
- Do not copy internal testing overlay files or sample-domain business content unless the user explicitly asks for them.
- Copy complete working slices only. If APIM is selected, include its infra, outputs, env wiring, and deployment/test wiring together.
- If APIM is not selected, omit APIM-specific files and references entirely instead of copying them and disabling them later.
- Apply the same rule to observability, private networking, capability hosts, frontend, API, and agent layers.
- Do not assume the copied app components will be deployed to Azure immediately. Local-only execution and reuse of existing hosting/registry assets are valid outcomes.

## Ref resolution template

```bash
# Ask first whether the user already wants a specific CAIRA release, tag, or commit.
# If not, prefer the latest release tag for a stable dependency:
curl -s https://api.github.com/repos/pablozaiden/CAIRA/releases/latest

# If a release tag is not appropriate, pin to a specific commit SHA instead:
git ls-remote https://github.com/pablozaiden/CAIRA.git refs/heads/main
```

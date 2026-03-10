# Strategy Consumption Modes

Use generated `deployment-strategies/` plus `docs/` as the primary CAIRA reference entry points. Only inspect `strategy-builder/` directly when you need deeper source-of-truth details that are not clear from the generated strategies or the docs.

## Default

Default to `reference` mode unless the user explicitly asks for a copied, self-contained layout.

## `reference` mode

- Keep selected reference architecture files close to the published CAIRA source.
- Convert local module paths to git module references that default to `main`.
- Only pin to an explicit tag, release, commit, or other ref when the user explicitly asks for it.

Template:

```hcl
source = "git::https://github.com/pablozaiden/CAIRA.git//strategy-builder/infra/modules/<module_name>?ref=main"
```

## `copy` mode

- Copy the selected architecture files and only the required modules.
- Determine required modules dynamically from Terraform `source` declarations.
- Do not copy internal testing overlay files or sample pirate-domain business content unless the user explicitly asks for them.
- Copy complete working slices only. If APIM is selected, include its infra, outputs, env wiring, and deployment/test wiring together.
- If APIM is not selected, omit APIM-specific files and references entirely instead of copying them and disabling them later.
- Apply the same rule to observability, private networking, capability hosts, frontend, API, and agent layers.

## Ref resolution template

```bash
REF=main
# Replace `main` only if the user explicitly asked for a specific CAIRA release, tag, commit, or other ref.
```

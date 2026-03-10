# Strategy Consumption Modes

## Default

Default to `reference` mode unless the user explicitly asks for a copied, self-contained layout.

## `reference` mode

- Keep selected reference architecture files close to the published CAIRA source.
- Convert local module paths to pinned git module references.
- Pin to an explicit tag or commit for reproducibility.

Template:

```hcl
source = "git::https://github.com/microsoft/CAIRA.git//strategy-builder/infra/modules/<module_name>?ref=<ref>"
```

## `copy` mode

- Copy the selected architecture files and only the required modules.
- Determine required modules dynamically from Terraform `source` declarations.
- Do not copy internal testing overlay files or sample pirate-domain business content unless the user explicitly asks for them.

## Ref resolution template

```bash
curl -s https://api.github.com/repos/microsoft/CAIRA/releases/latest
```

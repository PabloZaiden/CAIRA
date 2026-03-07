<!-- META
name: CAIRA Documentation
-->

# CAIRA Documentation

CAIRA documentation covers the whole product surface: shared Azure AI foundation infrastructure, reusable infrastructure modules, app-layer components, generated deployment strategies, and the workflows used to validate all of them together.

For most users, the primary CAIRA entrypoint is the installed CAIRA skill. The repository docs then become reference material the skill can inspect. The rest of this folder is mainly for contributors and maintainers working on CAIRA itself.

## Start here

- Use the CAIRA skill defined in `skills/caira/SKILL.md` when you want CAIRA guidance for your own solution.
- [Environment Setup](environment_setup.md) for contributors validating or extending CAIRA itself.
- [Developer Guide](developer.md) for contributor workflows.
- [Troubleshooting](troubleshooting.md) for skill-guided and repository-based troubleshooting.
- [Pull Request Guide](contributing/pull_request_guide.md) for contributors opening PRs.
- [Development Workflow](contributing/development_workflow.md) for contributors changing CAIRA itself.
- [Code Review Guidelines](contributing/code_review_guidelines.md) for contributor review expectations.
- [Security Posture](security_posture.md) for product-level security guidance.

## Operating model

CAIRA is organized around four connected layers:

1. **Foundation reference architectures** in `infra/architectures/`
1. **Reusable infrastructure modules** in `infra/modules/`
1. **Application and deployment-strategy source code** in `strategy-builder/`
1. **Committed generated deployments** in `deployment-strategies/`

The repository validation story matches that model, and these docs double as reference material for the CAIRA skill:

- **Pull requests** run fast static checks with `task validate:pr`
- **Nightly validation** runs Terraform acceptance coverage plus deployed strategy lifecycle tests for every committed deployment strategy

## Useful contributor root commands

```bash
task setup
task validate:pr
task test
task strategy:generate
task strategy:deploy:reference
task strategy:test:deployed -- deployment-strategies/typescript-openai-agent-sdk
```

## Additional areas

- Contributing guidance lives under `docs/contributing/`
- Infrastructure-specific guidance starts in `infra/README.md`
- App-layer and generator guidance starts in `strategy-builder/README.md`

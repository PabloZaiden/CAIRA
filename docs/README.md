<!-- META
 name: CAIRA Documentation
-->

# CAIRA Documentation

CAIRA documentation covers the whole product surface: macro reference architectures, reusable infrastructure modules, app-layer components, generated deployment strategies, and the workflows used to validate all of them together.

For most users, the primary CAIRA entrypoint is the installed CAIRA skill. Install it with the quickstart in the repository root README, then treat these docs as reference material the skill can inspect. The rest of this folder is mainly for contributors and maintainers working on CAIRA itself.

## Start here

| If you want to...                                                               | Start here                                                       |
|---------------------------------------------------------------------------------|------------------------------------------------------------------|
| Use CAIRA as reference material in your own solution                            | Repository root README and `skills/caira/SKILL.md`               |
| Extend CAIRA with new components, variants, templates, or deployment strategies | [Extending CAIRA](contributing/extending_caira.md)               |
| Choose the right command sequence for a specific change                         | [Developer Guide](developer.md)                                  |
| Prepare a contributor machine or devcontainer workflow                          | [Environment Setup](environment_setup.md)                        |
| Open or update a pull request                                                   | [Pull Request Guide](contributing/pull_request_guide.md)         |
| Follow the full contributor branch-and-commit flow                              | [Development Workflow](contributing/development_workflow.md)     |
| Review repository review expectations                                           | [Code Review Guidelines](contributing/code_review_guidelines.md) |
| Troubleshoot local or documentation issues                                      | [Troubleshooting](troubleshooting.md)                            |
| Understand product-level security guidance                                      | [Security Posture](security_posture.md)                          |

## Operating model

CAIRA is organized around four connected layers:

1. **Reference architectures** as directories under `strategy-builder/infra/reference-architectures/` (for example `strategy-builder/infra/reference-architectures/foundry_agentic_app/`, which composes a Foundry foundation with composable application-platform and service layers)
1. **Reusable infrastructure modules** in `strategy-builder/infra/modules/`
1. **Application and deployment-strategy source code** in `strategy-builder/`
1. **Committed generated deployments** in `deployment-strategies/`

The repository validation story matches that model, and these docs double as reference material for the CAIRA skill:

- **Pull requests** run fast static checks with `task validate:pr`
- **Nightly validation** runs deployed strategy lifecycle tests for every committed deployment strategy

## Useful contributor root commands

```bash
task setup
task strategy:generate
task strategy:validate:drift
task validate:pr
task test
task strategy:dev -- deployment-strategies/foundry_agentic_app/typescript-openai-agent-sdk-aca
task strategy:deploy -- deployment-strategies/foundry_agentic_app/typescript-openai-agent-sdk-aca
task strategy:test:deployed -- deployment-strategies/foundry_agentic_app/typescript-openai-agent-sdk-aca
task strategy:test:deployed -- --test-profile public deployment-strategies/foundry_agentic_app/typescript-openai-agent-sdk-aca
```

Private deployed profiles create the temporary jumpbox, keep the frontend on
VNet-scope ingress inside the internal Container Apps environment, and add the
private DNS records needed for VNet-only health checks and E2E access.

Use `task strategy:deploy:reference` only when you are specifically working on the shared baseline deployment or the strategy `.env` generation flow.

## Additional areas

- Contributing guidance lives under `docs/contributing/`
- Infrastructure-specific guidance starts in `strategy-builder/infra/README.md`
- App-layer and generator guidance starts in `strategy-builder/README.md`
- Component-level implementation details live under `strategy-builder/docs/guide/`

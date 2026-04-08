<!-- META
 title: Pull Request Guide
 description: How to prepare and submit pull requests to CAIRA.
 author: CAIRA Team
 ms.topic: guide
-->

# Pull Request Guide

This guide is for contributors opening pull requests against the CAIRA repository. If you want to use CAIRA in your own solution, start with the CAIRA skill instead of the repository contribution workflow.

## Before you open a pull request

Run the same fast validation suite that GitHub runs for pull requests:

```bash
task validate:pr
```

If your change touches deployed strategy behavior or infrastructure that needs
real Azure validation, also run the deeper validation that makes sense for your
scope, for example:

```bash
task test
task tf:test:pools:deploy
eval "$(task tf:test:pools:outputs:env)"
task strategy:test:deployed -- deployment-strategies/foundry_agentic_app/typescript-openai-agent-sdk-aca
```

## What the PR workflow checks

PR validation is intentionally fast and static. It covers:

- formatting and linting across the repository
- Terraform validation and docs generation
- strategy-builder lint/type validation plus generator drift checks
- markdown, spelling, workflow, and security scanners
- strict documentation site build

Full deploy/destroy lifecycle coverage runs in the nightly workflow instead of on every pull request. The deployed lifecycle path now exercises the public, private, and private-capability-host profiles.

## Pull request checklist

- [ ] Branch is up to date with `main`
- [ ] `task validate:pr` passes locally
- [ ] Documentation is updated when behavior or workflows changed
- [ ] Generated deployment strategies were refreshed if generator inputs changed
- [ ] No secrets, credentials, or environment-specific data were committed

## Pull request titles

Use Conventional Commits style titles, for example:

```text
feat(strategy-builder): add deployed strategy smoke validation
fix(infra): correct module path references
refactor(devcontainer): simplify default contributor setup
```

## Notes for reviewers

When describing your testing, separate **fast local/PR checks** from **full lifecycle validation** so reviewers can tell which validation path was exercised.

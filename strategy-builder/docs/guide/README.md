# CAIRA Strategy Builder Guide

This guide explains how the strategy-builder area fits into CAIRA and how to work on it without losing alignment with the repository-wide infrastructure model.

This guide is for contributors changing CAIRA itself. Most users should install the CAIRA skill and let their coding agent inspect the strategy-builder assets as reference material.

## What the strategy builder owns

The strategy builder is the source of truth for:

- reusable application-layer components
- shared contracts between those components
- generator logic that assembles supported deployment strategies
- local and Azure-backed validation tooling

The generated output lives in `deployment-strategies/` and is committed so CI can validate every supported strategy.

## Recommended commands

Use the repository root Taskfile so the infrastructure and strategy-builder workflows stay aligned:

```bash
task setup
task validate:pr
task strategy:generate
task strategy:test:local
task strategy:test:deployed -- deployment-strategies/typescript-openai-agent-sdk
```

## Guide contents

- [Architecture](./architecture.md)
- [Getting Started](./getting-started.md)
- [API Contracts](./contracts.md)
- [Agent Containers](./components/agent-containers.md)
- [API Container](./components/api-container.md)
- [Frontend](./components/frontend.md)
- [Testing Infrastructure](./testing.md)
- [Adding New Components](./adding-components.md)
- [Future Work](./future.md)

## Important rule

Do not hand-edit `deployment-strategies/`. Change the source in `strategy-builder/`, then regenerate.

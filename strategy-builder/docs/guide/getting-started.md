# Getting Started

This guide is for contributors working on CAIRA itself. If you want CAIRA to help build a solution for your own scenario, start with the CAIRA skill and treat this guide as reference material rather than the primary entrypoint.

## Preferred workflow

Use the repository root Taskfile. The root commands keep the infrastructure and strategy-builder workflows aligned.

```bash
task setup
task validate:pr
task strategy:generate
task strategy:test:local
```

## Common strategy workflows

| Command                                                          | Purpose                                        |
|------------------------------------------------------------------|------------------------------------------------|
| `task strategy:generate`                                         | Regenerate all committed deployment strategies |
| `task strategy:validate:pr`                                      | Run fast static strategy-builder validation    |
| `task strategy:test:local`                                       | Run the full local strategy-builder suite      |
| `task strategy:deploy:reference`                                 | Deploy the shared CAIRA foundation             |
| `task strategy:deploy:strategy -- deployment-strategies/<name>`  | Deploy one generated strategy to Azure         |
| `task strategy:destroy:strategy -- deployment-strategies/<name>` | Destroy one generated strategy deployment      |
| `task strategy:test:deployed -- deployment-strategies/<name>`    | Deploy, validate, and destroy one strategy     |

## Direct component workflows

When you are focused on one component, you can still work from that directory directly:

```bash
cd components/api/typescript
npm install
npm run lint
npm run typecheck
npm run test
```

## Important rule

`deployment-strategies/` is generated output. Update the source in `strategy-builder/`, then regenerate.

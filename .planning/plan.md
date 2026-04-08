# Devcontainer Simplification and Docker-in-Docker Migration Plan

## Objectives

1. Remove the prebuilt devcontainer definition and any repository references that depend on it.
2. Promote the current local devcontainer to the default repository devcontainer so it loads as a standard `.devcontainer/devcontainer.json`.
3. Migrate the contributor devcontainer from Docker Outside of Docker to Docker-in-Docker.
4. Update repository automation, contributor guidance, and code comments so they match the new single-devcontainer model.
5. Avoid running Docker-based validation during this work because Docker access is not available in the current environment.

## Proposed approach

Consolidate the contributor container setup into a single root devcontainer definition, then remove the prebuilt image path and its supporting assets. After that, update all impacted references so the repository consistently describes one default devcontainer that uses Docker-in-Docker.

## Task breakdown

| ID | Task | Description | Dependencies | Estimated complexity |
|---|---|---|---|---|
| T1 | Inventory current devcontainer references | Confirm every file that refers to `.devcontainer/local`, `.devcontainer/prebuilt`, prebuilt devcontainer workflows/images, or Docker Outside of Docker assumptions so the migration does not leave stale references behind. | None | Medium |
| T2 | Promote the local devcontainer to the default path | Move the contents of `.devcontainer/local/devcontainer.json` to `.devcontainer/devcontainer.json`, preserve contributor setup behavior, and remove the now-unneeded local subfolder structure. | T1 | Medium |
| T3 | Switch devcontainer feature set to Docker-in-Docker | Replace the `docker-outside-of-docker` feature with the Docker-in-Docker equivalent, then review adjacent settings such as mounts, user behavior, and create hooks to ensure the new container model still supports the repository workflows. | T2 | High |
| T4 | Remove prebuilt devcontainer artifacts | Delete `.devcontainer/prebuilt/devcontainer.json` and remove obsolete supporting automation/assets tied only to the prebuilt image path, including the prebuilt devcontainer workflows and any image-specific Dockerfile references if they are no longer needed. | T1, T2 | High |
| T5 | Update dependency and automation metadata | Adjust automation that depends on the devcontainer layout, such as Dependabot configuration and any workflow inputs or build commands that still point at `.devcontainer/local/devcontainer.json` or prebuilt image names. | T2, T4 | Medium |
| T6 | Refresh contributor documentation | Update `.devcontainer/README.md`, root/docs guidance, and workflow reference documentation so contributors are directed to the single default devcontainer and the Docker-in-Docker model. Remove any wording that still describes a prebuilt option as part of the supported setup. | T2, T3, T4, T5 | Medium |
| T7 | Review strategy-builder scripts and comments for networking assumptions | Revisit scripts and docs that explicitly call out Docker Outside of Docker behavior. Keep any logic that remains valid, but update comments, guidance, or assumptions where Docker-in-Docker changes the expected networking path. | T3, T6 | Medium |
| T8 | Perform non-Docker validation and document deferred checks | Run only safe non-Docker checks if needed for changed file types, and explicitly note that Docker/devcontainer validation must be deferred until an environment with Docker access is available. Do not run Docker-dependent validation in the current environment. | T5, T6, T7 | Low |

## Dependency flow

1. T1 establishes the full migration scope.
2. T2 must happen before most follow-on work because it defines the new canonical devcontainer path.
3. T3 depends on T2 because the Docker-in-Docker migration should be applied to the final canonical devcontainer file, not the old nested layout.
4. T4 can begin once the new default path is clear, because the prebuilt artifacts should only be removed after the replacement location is known.
5. T5 depends on the new path and prebuilt removal decisions.
6. T6 depends on the implementation details settled by T2 through T5.
7. T7 depends on the final Docker model from T3 and should align with the updated contributor guidance from T6.
8. T8 is last because it reflects the final change set and the known Docker-access limitation.

## Key considerations

- The current contributor devcontainer lives at `.devcontainer/local/devcontainer.json`; after migration the repository should expose a root `.devcontainer/devcontainer.json` as the default entrypoint.
- The repository currently contains a dedicated prebuilt devcontainer definition at `.devcontainer/prebuilt/devcontainer.json` plus supporting publication workflows under `.github/workflows/prebuilt-devcontainer*.yml`.
- The current local devcontainer uses `ghcr.io/devcontainers/features/docker-outside-of-docker:1`; this is the main configuration point that will need conversion to Docker-in-Docker.
- Several scripts, docs, and comments currently mention Docker Outside of Docker or special devcontainer networking behavior. Those references need explicit review during implementation so the migration does not leave misleading guidance behind.
- Because Docker is unavailable here, Docker-based checks should be recorded as follow-up validation rather than attempted during implementation.

# CAIRA - Development Container

For most users, the primary CAIRA entrypoint is the installed CAIRA skill, not a local clone of this repository.

This default repository devcontainer exists for contributors who need to work on CAIRA itself. VS Code supports [Remote Development within Containers](https://code.visualstudio.com/docs/remote/remote-overview). To run on your machine with a contributor clone, follow [official getting started](https://code.visualstudio.com/docs/devcontainers/containers#_getting-started) and [open the folder containing the repository in a container](https://code.visualstudio.com/docs/devcontainers/containers#_quick-start-open-an-existing-folder-in-a-container).

The repository now exposes a single contributor definition at `.devcontainer/devcontainer.json` and uses Docker-in-Docker for container workloads inside the devcontainer.

# syntax=docker/dockerfile:1.10
ARG BASE_DEVCONTAINER_IMAGE
FROM ${BASE_DEVCONTAINER_IMAGE:-ghcr.io/microsoft/caira-prebuilt-devcontainer-base:latest}
LABEL devcontainer.metadata="[]"
HEALTHCHECK NONE
USER root

ENV HOME=/home/vscode
ENV USER=vscode
ENV XDG_CONFIG_HOME=/home/vscode/.config
ENV XDG_CACHE_HOME=/home/vscode/.cache
ENV XDG_DATA_HOME=/home/vscode/.local/share

RUN mkdir -p /home/vscode/task
COPY ./Taskfile.yml /home/vscode/task
COPY ./.taskfiles /home/vscode/task/.taskfiles
COPY ./mkdocs.yml /home/vscode/task
COPY ./strategy-builder/scripts/prerequisites.sh /tmp/caira-prerequisites.sh

WORKDIR /home/vscode/task

RUN git init . &&   git config user.email "devcontainer@localhost" &&   git config user.name "devcontainer" &&   git add . &&   git commit -m "Temp commit"

RUN chmod +x /tmp/caira-prerequisites.sh &&   /tmp/caira-prerequisites.sh &&   rm -f /tmp/caira-prerequisites.sh

RUN task tools

RUN rm -rf /home/vscode/task
RUN chown -R vscode:vscode /home/vscode

WORKDIR /home/vscode
USER vscode

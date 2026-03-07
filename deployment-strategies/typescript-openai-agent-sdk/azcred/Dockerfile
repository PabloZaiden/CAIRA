# syntax=docker/dockerfile:1

# Az Credential Sidecar — serves Azure CLI tokens to containers via HTTP.
# Local-dev-only infrastructure container (not deployed to production).
#
# Uses mcr.microsoft.com/azure-cli as the base image (includes az CLI + Python).
# Node.js 24 binary is copied from node:24-alpine so the TypeScript server can
# run via native TypeScript support (no build step needed).
#
# The image uses the built-in `nonroot` user (uid 65532) for security.

# ---------- Stage 1: Install npm dependencies ----------
FROM node:24-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# ---------- Stage 1b: Provide glibc-linked Node.js binary ----------
# We use node:24-slim (Debian/glibc) — NOT node:24-alpine (musl) — because
# the azure-cli base image is Azure Linux (glibc). A musl binary won't work.
FROM node:24-slim AS node-bin

# ---------- Stage 2: Production image ----------
# checkov:skip=CKV_DOCKER_7: Local-only credential sidecar intentionally tracks the Azure CLI upstream tag.
FROM mcr.microsoft.com/azure-cli:latest

# Copy glibc-linked Node.js from the Debian stage.
COPY --from=node-bin /usr/local/bin/node /usr/local/bin/node
COPY --from=node-bin /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm && \
    ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx && \
    node --version

WORKDIR /app

# Copy deps from stage 1
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# Azure CLI config directory — the azurecli volume is mounted here
ENV AZURE_CONFIG_DIR=/app/.azure

# Create the .azure directory and set ownership for the nonroot user (uid 65532)
# which is built into the azure-cli base image.
RUN mkdir -p /app/.azure && chown -R 65532:65532 /app /app/.azure

# Switch to non-root (built-in nonroot user)
USER nonroot

# Default port
ENV PORT=8079
EXPOSE 8079

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -sf http://localhost:8079/health || exit 1

CMD ["node", "src/server.ts"]

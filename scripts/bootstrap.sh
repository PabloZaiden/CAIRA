#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

npm_ci() {
  local dir="$1"
  if [[ -f "${dir}/package-lock.json" ]]; then
    npm ci --prefix "${dir}" --silent
  else
    npm install --prefix "${dir}" --package-lock-only --silent
    npm ci --prefix "${dir}" --silent
  fi
}

npm_ci "${ROOT_DIR}/reference-architectures/app/api/typescript/openai-agents-sdk"
npm_ci "${ROOT_DIR}/reference-architectures/app/api/typescript/foundry-agent-service"
npm_ci "${ROOT_DIR}/reference-architectures/app/frontend/typescript/react"

dotnet restore "${ROOT_DIR}/reference-architectures/app/api/csharp/microsoft-agent-framework/Caira.Api.MicrosoftAgentFramework.csproj" --verbosity minimal

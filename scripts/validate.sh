#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

run_npm() {
  local dir="$1"
  npm audit --prefix "${dir}" --audit-level=moderate
  npm run typecheck --prefix "${dir}" --silent
  npm test --prefix "${dir}" --silent
  npm run build --prefix "${dir}" --silent
  docker build --quiet "${dir}" >/dev/null
}

run_terraform() {
  local dir="$1"
  terraform -chdir="${dir}" fmt -check
  terraform -chdir="${dir}" init -backend=false -input=false
  terraform -chdir="${dir}" validate
}

run_npm "${ROOT_DIR}/reference-architectures/app/api/typescript/openai-agents-sdk"
run_npm "${ROOT_DIR}/reference-architectures/app/api/typescript/foundry-agent-service"
run_npm "${ROOT_DIR}/reference-architectures/app/frontend/typescript/react"

dotnet build "${ROOT_DIR}/reference-architectures/app/api/csharp/microsoft-agent-framework/Caira.Api.MicrosoftAgentFramework.csproj" --no-restore
dotnet list "${ROOT_DIR}/reference-architectures/app/api/csharp/microsoft-agent-framework/Caira.Api.MicrosoftAgentFramework.csproj" package --vulnerable --include-transitive \
  | tee /tmp/caira-dotnet-vulnerable.txt
if grep -q "has the following vulnerable packages" /tmp/caira-dotnet-vulnerable.txt; then
  exit 1
fi
docker build --quiet "${ROOT_DIR}/reference-architectures/app/api/csharp/microsoft-agent-framework" >/dev/null

run_terraform "${ROOT_DIR}/reference-architectures/iac/foundry"
run_terraform "${ROOT_DIR}/reference-architectures/iac/container-apps"

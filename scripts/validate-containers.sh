#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

build_container() {
	local name="$1"
	local dir="$2"

	echo "Building ${name} container..."
	docker build --quiet "${dir}" >/dev/null
}

build_container "OpenAI Agents SDK API" "${ROOT_DIR}/reference-architectures/app/api/typescript/openai-agents-sdk"
build_container "Foundry Agent Service API" "${ROOT_DIR}/reference-architectures/app/api/typescript/foundry-agent-service"
build_container "React frontend" "${ROOT_DIR}/reference-architectures/app/frontend/typescript/react"
build_container "Microsoft Agent Framework API" "${ROOT_DIR}/reference-architectures/app/api/csharp/microsoft-agent-framework"

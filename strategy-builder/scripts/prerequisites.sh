#!/usr/bin/env bash
# prerequisites.sh — Installs all required development tools.
#
# Used by:
#   - .devcontainer/devcontainer.json (postCreateCommand)
#   - .github/workflows/ci.yml (PR validation)
#
# Idempotent: skips tools that are already installed at acceptable versions.
# Requires: curl, sudo, bash 4+
#
# Usage:
#   ./scripts/prerequisites.sh
set -euo pipefail

echo "=== CAIRA: Installing strategy-builder development prerequisites ==="
echo ""

# ---------------------------------------------------------------------------
# Helper: add a path to the current session if not already present
# ---------------------------------------------------------------------------
add_to_path() {
  local dir="$1"
  if [[ ":${PATH}:" != *":${dir}:"* ]]; then
    export PATH="${dir}:${PATH}"
  fi
}

# ---------------------------------------------------------------------------
# Helper: persist an export line in ~/.bashrc (idempotent)
# ---------------------------------------------------------------------------
persist_env() {
  local line="$1"
  local target="${HOME}/.bashrc"
  if ! grep -qF "$line" "$target" 2>/dev/null; then
    echo "$line" >>"$target"
  fi
}

# ---------------------------------------------------------------------------
# Node.js (via NodeSource)
# ---------------------------------------------------------------------------
if ! command -v node &>/dev/null; then
  echo "Installing Node.js 24.x..."
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
else
  echo "Node.js already installed: $(node --version)"
fi

# ---------------------------------------------------------------------------
# Python 3.12
# ---------------------------------------------------------------------------
if ! command -v python3 &>/dev/null; then
  echo "Installing Python 3.12..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq python3 python3-pip python3-venv
else
  echo "Python already installed: $(python3 --version)"
fi

# ---------------------------------------------------------------------------
# .NET SDK 10
# ---------------------------------------------------------------------------
if ! command -v dotnet &>/dev/null; then
  echo "Installing .NET SDK 10..."
  curl -fsSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 10.0
  add_to_path "${HOME}/.dotnet"
  export DOTNET_ROOT="${HOME}/.dotnet"
  persist_env "export DOTNET_ROOT=\"\${HOME}/.dotnet\""
  persist_env "export PATH=\"\${HOME}/.dotnet:\${PATH}\""
else
  echo ".NET SDK already installed: $(dotnet --version)"
fi

# ---------------------------------------------------------------------------
# Terraform
# ---------------------------------------------------------------------------
if ! command -v terraform &>/dev/null; then
  echo "Installing Terraform..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq gnupg software-properties-common
  curl -fsSL https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
  echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
  sudo apt-get update -qq
  sudo apt-get install -y -qq terraform
else
  echo "Terraform already installed: $(terraform --version | head -1)"
fi

# ---------------------------------------------------------------------------
# Azure CLI
# ---------------------------------------------------------------------------
if ! command -v az &>/dev/null; then
  echo "Installing Azure CLI..."
  curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
else
  echo "Azure CLI already installed: $(az version --query '\"azure-cli\"' -o tsv)"
fi

# ---------------------------------------------------------------------------
# GitHub CLI
# ---------------------------------------------------------------------------
if ! command -v gh &>/dev/null; then
  echo "Installing GitHub CLI..."
  sudo mkdir -p -m 755 /etc/apt/keyrings
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null
  sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq gh
else
  echo "GitHub CLI already installed: $(gh --version | head -1)"
fi

# ---------------------------------------------------------------------------
# Bun
# ---------------------------------------------------------------------------
if ! command -v bun &>/dev/null; then
  echo "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
  export BUN_INSTALL="${HOME}/.bun"
  add_to_path "${BUN_INSTALL}/bin"
  persist_env "export BUN_INSTALL=\"\${HOME}/.bun\""
  persist_env "export PATH=\"\${HOME}/.bun/bin:\${PATH}\""
else
  echo "Bun already installed: $(bun --version)"
fi

# ---------------------------------------------------------------------------
# uv (Python package manager)
# ---------------------------------------------------------------------------
if ! command -v uv &>/dev/null; then
  echo "Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  add_to_path "${HOME}/.local/bin"
  persist_env "export PATH=\"\${HOME}/.local/bin:\${PATH}\""
else
  echo "uv already installed: $(uv --version)"
fi

# ---------------------------------------------------------------------------
# tflint
# ---------------------------------------------------------------------------
if ! command -v tflint &>/dev/null; then
  echo "Installing tflint..."
  curl -s https://raw.githubusercontent.com/terraform-linters/tflint/master/install_linux.sh | bash
else
  echo "tflint already installed: $(tflint --version | head -1)"
fi

# ---------------------------------------------------------------------------
# actionlint
# ---------------------------------------------------------------------------
if ! command -v actionlint &>/dev/null; then
  echo "Installing actionlint..."
  ACTIONLINT_TMP="$(mktemp -d)"
  bash <(curl -s https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash) latest "${ACTIONLINT_TMP}"
  sudo mv "${ACTIONLINT_TMP}/actionlint" /usr/local/bin/actionlint
  rm -rf "${ACTIONLINT_TMP}"
else
  echo "actionlint already installed: $(actionlint --version | head -1)"
fi

# ---------------------------------------------------------------------------
# ShellCheck
# ---------------------------------------------------------------------------
if ! command -v shellcheck &>/dev/null; then
  echo "Installing ShellCheck..."
  sudo apt-get update -qq && sudo apt-get install -y -qq shellcheck
else
  echo "ShellCheck already installed: $(shellcheck --version | grep '^version:')"
fi

# ---------------------------------------------------------------------------
# Docker (skip if already available — expected in devcontainer or CI)
# ---------------------------------------------------------------------------
if ! command -v docker &>/dev/null; then
  echo "WARNING: Docker is not installed. In a devcontainer, Docker is provided"
  echo "         by the docker-outside-of-docker feature. In CI, use a setup action."
else
  echo "Docker already installed: $(docker --version)"
fi

echo ""
echo "=== Prerequisites installation complete ==="
echo "Run ./scripts/verify-environment.sh to validate the full toolchain."

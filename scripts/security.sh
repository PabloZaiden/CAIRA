#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GITLEAKS_VERSION="8.30.0"
TRIVY_VERSION="0.70.0"

install_gitleaks() {
  local os arch archive url install_dir

  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "${arch}" in
    x86_64 | amd64) arch="x64" ;;
    aarch64 | arm64) arch="arm64" ;;
    *)
      echo "Unsupported architecture for automatic Gitleaks install: ${arch}" >&2
      exit 1
      ;;
  esac

  install_dir="${HOME}/.local/bin"
  mkdir -p "${install_dir}"

  archive="$(mktemp)"
  url="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_${os}_${arch}.tar.gz"
  curl --location --fail --silent --show-error --output "${archive}" "${url}"
  tar -xzf "${archive}" -C "${install_dir}" gitleaks
  rm -f "${archive}"
  chmod +x "${install_dir}/gitleaks"
  export PATH="${install_dir}:${PATH}"
}

install_trivy() {
  local os arch archive url install_dir

  os="$(uname -s)"
  case "${os}" in
    Linux | Darwin) ;;
    *)
      echo "Unsupported OS for automatic Trivy install: ${os}" >&2
      exit 1
      ;;
  esac

  arch="$(uname -m)"
  case "${arch}" in
    x86_64 | amd64) arch="64bit" ;;
    aarch64 | arm64) arch="ARM64" ;;
    *)
      echo "Unsupported architecture for automatic Trivy install: ${arch}" >&2
      exit 1
      ;;
  esac

  install_dir="${HOME}/.local/bin"
  mkdir -p "${install_dir}"

  archive="$(mktemp)"
  url="https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_${os}-${arch}.tar.gz"
  curl --location --fail --silent --show-error --output "${archive}" "${url}"
  tar -xzf "${archive}" -C "${install_dir}" trivy
  rm -f "${archive}"
  chmod +x "${install_dir}/trivy"
  export PATH="${install_dir}:${PATH}"
}

if ! command -v gitleaks >/dev/null 2>&1; then
  install_gitleaks
fi

if ! command -v trivy >/dev/null 2>&1; then
  install_trivy
fi

gitleaks detect \
  --config "${ROOT_DIR}/.github/linters/.gitleaks.toml" \
  --redact=90 \
  --source "${ROOT_DIR}" \
  --no-banner

trivy fs \
  --scanners vuln,secret,misconfig \
  --severity HIGH,CRITICAL \
  --exit-code 1 \
  --ignore-unfixed \
  "${ROOT_DIR}"

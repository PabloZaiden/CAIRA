#!/usr/bin/env bash
# verify-environment.sh — Verify all required development tools are installed
# at the correct minimum versions.
#
# Usage:
#   ./scripts/verify-environment.sh            # Human-readable output
#   ./scripts/verify-environment.sh --json      # Machine-parseable JSON output
#
# Exit codes:
#   0 — All tools present and at or above minimum versions
#   1 — One or more tools missing or below minimum version
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration: tool name, version command, version regex, minimum version
# ---------------------------------------------------------------------------
# Each entry is: name|command|regex|minimum
# - command: shell command to get version string
# - regex: extended regex to extract the version number (first capture group)
# - minimum: minimum acceptable version (semver compared numerically)
TOOLS=(
  "node|node --version|v([0-9]+\.[0-9]+\.[0-9]+)|24.0.0"
  "bun|bun --version|([0-9]+\.[0-9]+\.[0-9]+)|1.3.0"
  "python|python3 --version|Python ([0-9]+\.[0-9]+\.[0-9]+)|3.12.0"
  "uv|uv --version|uv ([0-9]+\.[0-9]+\.[0-9]+)|0.10.0"
  "dotnet|dotnet --version|([0-9]+\.[0-9]+\.[0-9]+)|10.0.0"
  "terraform|terraform --version|Terraform v([0-9]+\.[0-9]+\.[0-9]+)|1.14.0"
  "docker|docker --version|Docker version ([0-9]+\.[0-9]+\.[0-9]+)|29.0.0"
  "docker-compose|docker compose version|v([0-9]+\.[0-9]+\.[0-9]+)|2.40.0"
  "az|az version -o json|\"azure-cli\": \"([0-9]+\.[0-9]+\.[0-9]+)\"|2.60.0"
  "gh|gh --version|gh version ([0-9]+\.[0-9]+\.[0-9]+)|2.40.0"
  "git|git --version|git version ([0-9]+\.[0-9]+\.[0-9]+)|2.30.0"
  "tflint|tflint --version|TFLint version ([0-9]+\.[0-9]+\.[0-9]+)|0.50.0"
  "shellcheck|shellcheck --version|version: ([0-9]+\.[0-9]+\.[0-9]+)|0.9.0"
)

# ---------------------------------------------------------------------------
# Semver comparison
# ---------------------------------------------------------------------------
# Returns 0 if $1 >= $2 (both in X.Y.Z format), 1 otherwise.
version_gte() {
  local -a v1
  local -a v2
  IFS='.' read -r -a v1 <<<"$1"
  IFS='.' read -r -a v2 <<<"$2"
  for i in 0 1 2; do
    local a="${v1[$i]:-0}"
    local b="${v2[$i]:-0}"
    if ((a > b)); then return 0; fi
    if ((a < b)); then return 1; fi
  done
  return 0 # equal
}

# ---------------------------------------------------------------------------
# Output mode
# ---------------------------------------------------------------------------
JSON_MODE=false
if [[ "${1:-}" == "--json" ]]; then
  JSON_MODE=true
fi

# ---------------------------------------------------------------------------
# Run checks
# ---------------------------------------------------------------------------
PASS_COUNT=0
FAIL_COUNT=0
RESULTS=()
JSON_ENTRIES=()

for entry in "${TOOLS[@]}"; do
  IFS='|' read -r name cmd regex minimum <<<"$entry"

  # Check if the command's base binary exists
  base_bin="${cmd%% *}"
  # Handle "docker compose" as a special case
  if [[ "$name" == "docker-compose" ]]; then
    base_bin="docker"
  fi

  if ! command -v "$base_bin" &>/dev/null; then
    FAIL_COUNT=$((FAIL_COUNT + 1))
    status="MISSING"
    detected="—"
    RESULTS+=("$(printf '%-16s %-12s %-12s %s' "$name" "$detected" ">= $minimum" "$status")")
    JSON_ENTRIES+=("{\"name\":\"$name\",\"detected\":null,\"minimum\":\"$minimum\",\"status\":\"missing\"}")
    continue
  fi

  # Get version output
  version_output="$(eval "$cmd" 2>&1 || true)"

  # Extract version with regex
  if [[ "$version_output" =~ $regex ]]; then
    detected="${BASH_REMATCH[1]}"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    status="PARSE_ERROR"
    detected="—"
    RESULTS+=("$(printf '%-16s %-12s %-12s %s' "$name" "$detected" ">= $minimum" "$status")")
    JSON_ENTRIES+=("{\"name\":\"$name\",\"detected\":null,\"minimum\":\"$minimum\",\"status\":\"parse_error\"}")
    continue
  fi

  # Compare versions
  if version_gte "$detected" "$minimum"; then
    PASS_COUNT=$((PASS_COUNT + 1))
    status="OK"
    JSON_ENTRIES+=("{\"name\":\"$name\",\"detected\":\"$detected\",\"minimum\":\"$minimum\",\"status\":\"ok\"}")
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    status="TOO_OLD"
    JSON_ENTRIES+=("{\"name\":\"$name\",\"detected\":\"$detected\",\"minimum\":\"$minimum\",\"status\":\"too_old\"}")
  fi

  RESULTS+=("$(printf '%-16s %-12s %-12s %s' "$name" "$detected" ">= $minimum" "$status")")
done

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
if $JSON_MODE; then
  echo "{"
  echo "  \"pass\": $PASS_COUNT,"
  echo "  \"fail\": $FAIL_COUNT,"
  echo "  \"tools\": ["
  for i in "${!JSON_ENTRIES[@]}"; do
    if ((i < ${#JSON_ENTRIES[@]} - 1)); then
      echo "    ${JSON_ENTRIES[$i]},"
    else
      echo "    ${JSON_ENTRIES[$i]}"
    fi
  done
  echo "  ]"
  echo "}"
else
  echo ""
  printf '%-16s %-12s %-12s %s\n' "TOOL" "VERSION" "REQUIRED" "STATUS"
  printf '%-16s %-12s %-12s %s\n' "----" "-------" "--------" "------"
  for line in "${RESULTS[@]}"; do
    echo "$line"
  done
  echo ""
  echo "Result: $PASS_COUNT passed, $FAIL_COUNT failed"
fi

# ---------------------------------------------------------------------------
# Exit code
# ---------------------------------------------------------------------------
if ((FAIL_COUNT > 0)); then
  if ! $JSON_MODE; then
    echo ""
    echo "ERROR: $FAIL_COUNT tool(s) missing or below minimum version."
    echo "Run 'task tools && task bootstrap' from the repository root, or use 'task setup' for the full local setup flow."
    echo "See strategy-builder/docs/PREREQUISITES.md for installation instructions."
  fi
  exit 1
else
  if ! $JSON_MODE; then
    echo ""
    echo "All tools verified successfully."
  fi
  exit 0
fi

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_SOURCE="${CAIRA_SKILL_SOURCE:-${ROOT_DIR}/skills}"
COPILOT_VERSION="${CAIRA_COPILOT_VERSION:-1.0.51}"

if [[ -n "${CAIRA_TEST_WORKDIR:-}" ]]; then
  WORK_DIR="${CAIRA_TEST_WORKDIR}"
  mkdir -p "${WORK_DIR}"
  if [[ -n "$(find "${WORK_DIR}" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    echo "CAIRA_TEST_WORKDIR must point to an empty directory: ${WORK_DIR}" >&2
    exit 1
  fi
  KEEP_WORK_DIR="true"
else
  WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/caira-skill-test.XXXXXX")"
  KEEP_WORK_DIR="${CAIRA_KEEP_TEST_WORKDIR:-false}"
fi

cleanup() {
  if [[ "${KEEP_WORK_DIR}" != "true" ]]; then
    rm -rf "${WORK_DIR}"
  else
    echo "Keeping test workspace: ${WORK_DIR}"
  fi
}
trap cleanup EXIT

ensure_copilot() {
  if command -v copilot >/dev/null 2>&1; then
    return
  fi

  local tool_dir="${CAIRA_TEST_TOOL_DIR:-${WORK_DIR}/.tools/npm-global}"
  echo "Installing GitHub Copilot CLI ${COPILOT_VERSION}"
  npm install --global --prefix "${tool_dir}" "@github/copilot@${COPILOT_VERSION}" --silent
  export PATH="${tool_dir}/bin:${PATH}"
}

ensure_copilot

export CI="${CI:-true}"
export COPILOT_ALLOW_ALL="${COPILOT_ALLOW_ALL:-true}"
export NO_COLOR="${NO_COLOR:-1}"

COPILOT_ARGS=(
  -C "${WORK_DIR}"
  --yolo
  --no-ask-user
  --no-auto-update
  --silent
  --stream
  off
)

if [[ -n "${CAIRA_COPILOT_MODEL:-}" ]]; then
  COPILOT_ARGS+=(--model "${CAIRA_COPILOT_MODEL}")
fi

echo "Test workspace: ${WORK_DIR}"
echo "Installing CAIRA skill from ${SKILL_SOURCE}"
(
  cd "${WORK_DIR}"
  npx --yes skills add "${SKILL_SOURCE}" --skill caira --agent '*' --yes --copy
)

read -r -d '' GENERATE_PROMPT <<'PROMPT' || true
Use the installed CAIRA skill to create an agentic monitoring system to detect security-related issues in a configured GitHub repository using Azure AI Foundry, an API, and a React frontend with a dashboard.

This is an unattended test in a brand-new empty directory. Treat the following as the clarifications and approvals you need so you can complete the task in one shot:
- Do not ask follow-up questions and do not wait for confirmation.
- Build a local scaffold/prototype only; do not deploy cloud resources and do not require real Azure credentials.
- Use TypeScript for the API and React frontend.
- Prefer the CAIRA Foundry Agent Service TypeScript API reference for the backend, the CAIRA React frontend reference for the dashboard, and the CAIRA API contract where useful.
- Include placeholders and `.env.example` files for any required repository, Foundry, model, identity, or telemetry settings. Do not include secrets.
- Add concise README/setup instructions that explain how to configure the target GitHub repository and Azure/Foundry settings later.
- Preserve component-local validation style where practical, but keep the generated project small enough for a test.
- In your final response, list the CAIRA reference paths you inspected or adapted and what you intentionally left out.
PROMPT

GENERATOR_OUTPUT="${WORK_DIR}/.caira-test-generator.out"
echo "Running Copilot generator"
copilot "${COPILOT_ARGS[@]}" --prompt "${GENERATE_PROMPT}" | tee "${GENERATOR_OUTPUT}"

read -r -d '' VERIFY_PROMPT <<'PROMPT' || true
Verify the CAIRA skill test result in this workspace. Do not modify files.

The generator was expected to install and use the CAIRA skill to create a local scaffold for: "Create an agentic monitoring system to detect security-related issues in a configured GitHub repository using Foundry, an API, and a React frontend with a dashboard."

Inspect the workspace and the generator output in `.caira-test-generator.out`. The test passes only if all of these are true:
1. The CAIRA skill is installed in this project, for example under `.agents/skills/caira/SKILL.md` or `skills/caira/SKILL.md`.
2. The generator created concrete project files, not only prose.
3. The generated project includes API/backend code, React frontend/dashboard code, and README or setup documentation.
4. The generated documentation or final output identifies relevant CAIRA reference paths, including API and frontend references.
5. The generated project uses placeholders or env examples instead of real secrets and does not attempt cloud deployment.
6. The generator did not stop to ask clarification questions instead of implementing.

End your response with exactly one result line, with no leading or trailing spaces:
CAIRA_TEST_RESULT=PASS
or
CAIRA_TEST_RESULT=FAIL
PROMPT

VERIFIER_OUTPUT="${WORK_DIR}/.caira-test-verifier.out"
echo "Running Copilot verifier"
copilot "${COPILOT_ARGS[@]}" --prompt "${VERIFY_PROMPT}" | tee "${VERIFIER_OUTPUT}"

if grep -Eq '^[[:space:]]*CAIRA_TEST_RESULT=PASS[[:space:]]*$' "${VERIFIER_OUTPUT}" && ! grep -Eq '^[[:space:]]*CAIRA_TEST_RESULT=FAIL[[:space:]]*$' "${VERIFIER_OUTPUT}"; then
  echo "CAIRA skill test passed"
else
  echo "CAIRA skill test failed" >&2
  echo "Generator output: ${GENERATOR_OUTPUT}" >&2
  echo "Verifier output: ${VERIFIER_OUTPUT}" >&2
  if [[ "${KEEP_WORK_DIR}" != "true" ]]; then
    echo "Re-run with CAIRA_KEEP_TEST_WORKDIR=true to inspect the workspace." >&2
  fi
  exit 1
fi

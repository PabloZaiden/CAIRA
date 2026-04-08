function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function deriveDeepHealthUrl(frontendUrl: string): string {
  return `${frontendUrl.replace(/\/+$/, '')}/health/deep`;
}

export function buildPrivateFrontendHealthCommand(healthUrl: string): string {
  return [
    'set -euo pipefail',
    `health_url=${shellQuote(healthUrl)}`,
    'for _ in $(seq 1 60); do',
    '  if curl --connect-timeout 5 --max-time 10 -fsSk "$health_url" >/dev/null; then',
    '    exit 0',
    '  fi',
    '  sleep 10',
    'done',
    'echo "Timed out waiting for private frontend health" >&2',
    'exit 1'
  ].join('\n');
}

export function buildPrivateE2ECommand(remoteDir: string, frontendUrl: string): string {
  return [
    'set -euo pipefail',
    `cd ${shellQuote(remoteDir)}`,
    'npm ci --no-audit --no-fund',
    `CI=1 E2E_BASE_URL=${shellQuote(frontendUrl)} npx vitest run --reporter verbose`
  ].join('\n');
}

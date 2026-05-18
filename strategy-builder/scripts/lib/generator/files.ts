/**
 * File generators — pure functions that produce the content of generated files
 * for each sample project. No I/O — these return strings.
 *
 * Generated files: docker-compose.yml, .env.example, README.md,
 * strategy.provenance.json, .gitignore, tsconfig.base.json (copy).
 */

import type { SampleConfig } from './types.ts';

// ---------------------------------------------------------------------------
// docker-compose.yml
// ---------------------------------------------------------------------------

/**
 * Build an environment block for a compose service.
 * Required vars use ${VAR} (must be set); optional vars use ${VAR:-default}.
 */
function composeEnvLines(
  requiredEnv: readonly string[],
  optionalEnv: readonly string[],
  /** Extra hardcoded env vars like PORT, AGENT_SERVICE_URL. */
  extra: Record<string, string>
): string[] {
  const lines: string[] = [];

  for (const [k, v] of Object.entries(extra)) {
    lines.push(`      ${k}: ${v}`);
  }

  for (const key of requiredEnv) {
    // Skip vars already in extra
    if (key in extra) continue;
    lines.push(`      ${key}: \${${key}}`);
  }

  for (const key of optionalEnv) {
    if (key in extra) continue;
    // Skip generic vars that are handled elsewhere (PORT, HOST, LOG_LEVEL, SKIP_AUTH)
    if (['PORT', 'HOST', 'SKIP_AUTH'].includes(key)) continue;
    const defaultVal = getEnvDefault(key);
    if (defaultVal !== undefined) {
      lines.push(`      ${key}: \${${key}:-${defaultVal}}`);
    }
    // Omit optional vars with no known default — let the application use its
    // own built-in defaults.  Setting `${VAR:-}` would override them with "".
  }

  return lines;
}

/** Known default values for optional env vars. */
function getEnvDefault(key: string): string | undefined {
  const defaults: Record<string, string> = {
    LOG_LEVEL: 'debug',
    AZURE_OPENAI_API_VERSION: '2025-03-01-preview',
    AGENT_MODEL: 'gpt-5.2-chat',
    CORS_ORIGIN: '*',
    APPLICATIONINSIGHTS_CONNECTION_STRING: ''
  };
  return defaults[key];
}

export function generateComposeFile(config: SampleConfig): string {
  const { agent, api, frontend } = config;

  const agentEnvLines = composeEnvLines(agent.manifest.requiredEnv, agent.manifest.optionalEnv, {
    PORT: '"3000"',
    IDENTITY_ENDPOINT: 'http://azcred:8079/token',
    IMDS_ENDPOINT: 'dummy_required_value',
    SKIP_AUTH: '"true"'
  });

  const apiEnvLines = composeEnvLines(api.manifest.requiredEnv, api.manifest.optionalEnv, {
    PORT: '"4000"',
    AGENT_SERVICE_URL: 'http://agent:3000',
    IDENTITY_ENDPOINT: 'http://azcred:8079/token',
    IMDS_ENDPOINT: 'dummy_required_value',
    SKIP_AUTH: '"true"'
  });

  const frontendEnvLines = composeEnvLines(frontend.manifest.requiredEnv, frontend.manifest.optionalEnv, {
    API_BASE_URL: 'http://api:4000',
    SKIP_AUTH: '"true"'
  });

  // C# containers have curl instead of wget; TypeScript/Node containers use wget
  const agentHealthCmd = healthCheckCommand(
    agent.manifest.language,
    agent.manifest.port,
    agent.manifest.healthEndpoint
  );
  const apiHealthCmd = healthCheckCommand(api.manifest.language, api.manifest.port, api.manifest.healthEndpoint);

  return `# CAIRA Deployment Strategy: ${formatSampleTitle(config)}
#
# Self-contained deployment strategy — all source code is included in this directory.
# Authentication uses DefaultAzureCredential via the az credential sidecar.
#
# Prerequisites:
#   1. Create the azurecli Docker volume and log in:
#      docker volume create azurecli
#      docker run -it --rm -v azurecli:/root/.azure mcr.microsoft.com/azure-cli az login --use-device-code
#   2. Copy .env.example to .env and fill in your Azure values.
#
# Usage:
#   cp .env.example .env
#   # Edit .env with your Azure values
#   docker compose up --build

---

services:
  azcred:
    build:
      context: ./azcred
    volumes:
      - azurecli:/app/.azure
    networks:
      - caira-net
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://127.0.0.1:8079/health"]
      interval: 10s
      timeout: 5s
      start_period: 5s
      retries: 3

  frontend:
    build:
      context: ./frontend
    ports:
      - "${frontend.manifest.port}:${frontend.manifest.port}"
    environment:
${frontendEnvLines.join('\n')}
    depends_on:
      api:
        condition: service_healthy
    networks:
      - caira-net
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://127.0.0.1:${frontend.manifest.port}${frontend.manifest.healthEndpoint}"]
      interval: 10s
      timeout: 5s
      start_period: 10s
      retries: 3

  api:
    build:
      context: ./api
    ports:
      - "${api.manifest.port}:${api.manifest.port}"
    environment:
${apiEnvLines.join('\n')}
    depends_on:
      agent:
        condition: service_healthy
      azcred:
        condition: service_healthy
    networks:
      - caira-net
    healthcheck:
      test: ${apiHealthCmd}
      interval: 10s
      timeout: 5s
      start_period: 10s
      retries: 3

  agent:
    build:
      context: ./agent
    ports:
      - "${agent.manifest.port}:${agent.manifest.port}"
    environment:
${agentEnvLines.join('\n')}
    depends_on:
      azcred:
        condition: service_healthy
    networks:
      - caira-net
    healthcheck:
      test: ${agentHealthCmd}
      interval: 10s
      timeout: 5s
      start_period: 10s
      retries: 3

networks:
  caira-net:
    driver: bridge

volumes:
  azurecli:
    external: true
`;
}

/**
 * Generate the appropriate health check command for a container.
 * Node/Alpine images have wget; .NET images have curl.
 */
function healthCheckCommand(language: string, port: number, healthEndpoint: string): string {
  if (language === 'csharp') {
    return `["CMD", "curl", "-f", "http://127.0.0.1:${port}${healthEndpoint}"]`;
  }
  return `["CMD", "wget", "-q", "--spider", "http://127.0.0.1:${port}${healthEndpoint}"]`;
}

// ---------------------------------------------------------------------------
// .env.example
// ---------------------------------------------------------------------------

export function generateEnvExample(config: SampleConfig): string {
  const { agent } = config;
  const title = formatSampleTitle(config);

  const lines: string[] = [
    `# CAIRA Deployment Strategy: ${title}`,
    '#',
    '# Copy this file to .env and fill in your Azure values.',
    '# Authentication uses DefaultAzureCredential via the az credential sidecar.',
    '# Run the following first to set up the azurecli Docker volume:',
    '#   docker volume create azurecli',
    '#   docker run -it --rm -v azurecli:/root/.azure mcr.microsoft.com/azure-cli az login --use-device-code',
    '',
    '# ─── Required ────────────────────────────────────────────────────────────',
    ''
  ];

  for (const key of agent.manifest.requiredEnv) {
    const comment = getEnvComment(key);
    if (comment) lines.push(`# ${comment}`);
    lines.push(`${key}=`);
    lines.push('');
  }

  // Add optional vars if the agent has any interesting ones
  const interestingOptional = agent.manifest.optionalEnv.filter(
    (k) => !['PORT', 'HOST', 'SKIP_AUTH', 'LOG_LEVEL'].includes(k)
  );

  if (interestingOptional.length > 0) {
    lines.push('# ─── Optional ────────────────────────────────────────────────────────────');
    lines.push('');

    for (const key of interestingOptional) {
      const comment = getEnvComment(key);
      const defaultVal = getEnvDefault(key);
      if (comment) lines.push(`# ${comment}`);
      lines.push(`${key}=${defaultVal ?? ''}`);
      lines.push('');
    }
  }

  // LOG_LEVEL is always included as optional
  lines.push('# Log level: trace, debug, info, warn, error, fatal (default: debug)');
  lines.push('LOG_LEVEL=debug');
  lines.push('');

  return lines.join('\n');
}

/** Human-readable comments for known env vars. */
function getEnvComment(key: string): string | undefined {
  const comments: Record<string, string> = {
    AZURE_AI_PROJECT_ENDPOINT:
      'Azure AI Foundry project endpoint (e.g., https://<resource>.services.ai.azure.com/api/projects/<project>)',
    AZURE_OPENAI_ENDPOINT:
      'Azure OpenAI endpoint or APIM gateway URL for SDK-based callers (e.g., https://<resource>.openai.azure.com)',
    AGENT_SERVICE_URL: 'URL of the agent service',
    API_BASE_URL: 'URL of the business API (default: http://api:4000)',
    AZURE_OPENAI_API_VERSION: 'API version (default: 2025-03-01-preview)',
    AGENT_MODEL: 'Model deployment name (default: gpt-5.2-chat)',
    AGENT_NAME: 'Agent display name',
    SHARED_INSTRUCTIONS: 'Shared system prompt applied to all specialists',
    DISCOVERY_INSTRUCTIONS: 'System prompt for the opportunity discovery specialist',
    PLANNING_INSTRUCTIONS: 'System prompt for the account planning specialist',
    STAFFING_INSTRUCTIONS: 'System prompt for staffing interview specialist',
    APPLICATIONINSIGHTS_CONNECTION_STRING: 'Optional App Insights connection string for OTEL export',
    AGENT_TOKEN_SCOPE: 'Token scope for agent authentication',
    CORS_ORIGIN: 'CORS allowed origin (default: *)',
    LOG_LEVEL: 'Log level: trace, debug, info, warn, error, fatal (default: debug)'
  };
  return comments[key];
}

// ---------------------------------------------------------------------------
// README.md
// ---------------------------------------------------------------------------

export function generateReadme(config: SampleConfig): string {
  const { agent, api, frontend } = config;
  const title = formatSampleTitle(config);
  const strategyRepoPath = formatStrategyRepoPath(config);
  const agentDesc = agent.manifest.description ?? 'Agent service';
  const infrastructureLabel = formatSlugTitle(config.iac.manifest.variant ?? config.infraVariant);
  const serviceTable = renderMarkdownTable(
    ['Service', 'Port', 'Health Check', 'Description'],
    [
      ['Credentials Sidecar', '8079', '`/health`', 'Serves Azure CLI tokens to containers via IDENTITY_ENDPOINT'],
      [
        'Frontend',
        String(frontend.manifest.port),
        `\`${frontend.manifest.healthEndpoint}\``,
        'React SPA + BFF (proxies /api to API service)'
      ],
      [
        'API',
        String(api.manifest.port),
        `\`${api.manifest.healthEndpoint}\``,
        'Business API (routes, conversation management)'
      ],
      ['Agent', String(agent.manifest.port), `\`${agent.manifest.healthEndpoint}\``, agentDesc]
    ]
  );
  const requiredEnvTable = renderMarkdownTable(
    ['Variable', 'Description'],
    agent.manifest.requiredEnv.map((key) => [`\`${key}\``, getEnvComment(key) ?? key])
  );
  const optionalEnvTable = renderMarkdownTable(
    ['Variable', 'Default', 'Description'],
    [
      ...agent.manifest.optionalEnv
        .filter((key) => !['PORT', 'HOST', 'SKIP_AUTH', 'LOG_LEVEL'].includes(key))
        .map((key) => [`\`${key}\``, `\`${getEnvDefault(key) ?? ''}\``, getEnvComment(key) ?? key]),
      ['`LOG_LEVEL`', '`debug`', 'Log level: trace, debug, info, warn, error, fatal']
    ]
  );

  // Build language-aware descriptions for the stack
  const frontendDesc = 'React + TypeScript (Vite build, Fastify BFF)';
  const apiDesc = config.language === 'csharp' ? 'C# ASP.NET Core Minimal API' : 'TypeScript Fastify business API';

  // Determine the primary required env var for the "quick start" section
  const primaryEnvVar = agent.manifest.requiredEnv[0] ?? 'AZURE_ENDPOINT';
  const apimRoutingNote =
    config.agentVariant === 'foundry-agent-service'
      ? 'The Foundry Agent Service variant keeps using `AZURE_AI_PROJECT_ENDPOINT` directly. When the gateway is enabled, the APIM outputs are available for external OpenAI-style callers or custom integrations.'
      : 'When the gateway is enabled in Azure deployments, the OpenAI-compatible agent container automatically points `AZURE_OPENAI_ENDPOINT` at `apim_gateway_url`, so model traffic flows through APIM without runtime branching in the app. Use `apim_openai_api_base_url` or `apim_chat_completions_url_template` for manual REST callers.';

  return `# CAIRA Deployment Strategy: ${title}

A complete, self-contained deployment strategy for the ${config.referenceArchitecture.manifest.displayName} reference architecture using ${infrastructureLabel} with:

- **Frontend:** ${frontendDesc}
- **API:** ${apiDesc}
- **Agent:** ${agentDesc}

## Architecture

\`\`\`text
Browser → Frontend (BFF :${frontend.manifest.port}) → API (:${api.manifest.port}) → Agent (:${agent.manifest.port}) → Azure AI
              /api proxy

Credentials Sidecar (:8079) ← azurecli volume ← \`az login\`
  ↕ IDENTITY_ENDPOINT (agent, api get tokens via HTTP)
\`\`\`

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose v2
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli)
- An Azure AI endpoint with a deployed model

## Quick Start

1. Create the \`azurecli\` Docker volume and log in to Azure:

   \`\`\`bash
   docker volume create azurecli
   docker run -it --rm -v azurecli:/root/.azure mcr.microsoft.com/azure-cli az login --use-device-code
   \`\`\`

1. Copy the environment template:

   \`\`\`bash
   cp .env.example .env
   \`\`\`

1. Edit \`.env\` with your Azure endpoint:

   \`\`\`text
   ${primaryEnvVar}=https://<your-resource>...
   \`\`\`

1. Start the stack:

   \`\`\`bash
   docker compose up --build
   \`\`\`

1. Open <http://localhost:${frontend.manifest.port}> in your browser.

1. Verify credentials are working:

   \`\`\`bash
   curl http://localhost:${agent.manifest.port}/identity
   curl http://localhost:${api.manifest.port}/identity
   \`\`\`

To stop:

\`\`\`bash
docker compose down
\`\`\`

## Deploy to Azure

This deployment strategy includes Terraform IaC under \`infra/\` and can be deployed from the
repository root with:

\`\`\`bash
task strategy:deploy -- ${strategyRepoPath}
\`\`\`

The deploy command:

- Deploys the layered CAIRA foundation (Foundry foundation + composable app-infra layers) and writes strategy \`.env\` values automatically
- Detects your current IP via \`curl ifconfig.io\`
- Restricts frontend ingress to that single CIDR
- Creates the layered Azure AI + Container Registry + Container Apps infrastructure with Terraform
- Rolls out bootstrap app shells first, then updates them to the strategy images
- Uses managed identity auth for Container Apps image pulls from ACR
- Creates required role assignments (AcrPull + Azure AI roles for the agent)
- Exposes frontend via HTTPS termination (container still serves HTTP internally)
- Builds/pushes images and updates the deployment

To tear down:

\`\`\`bash
task strategy:destroy -- ${strategyRepoPath}
\`\`\`

## Optional APIM AI Gateway

This strategy can optionally deploy Azure API Management in front of the
Foundry OpenAI-style chat completions endpoint:

- disabled by default
- enable with \`enable_apim_ai_gateway = true\`
- defaults to the \`Developer_1\` SKU unless you override \`apim_sku_name\`
- intended for optional governance, observability, and policy enforcement

When enabled, Terraform outputs expose:

- \`apim_gateway_name\`
- \`apim_gateway_url\`
- \`apim_openai_api_base_url\`
- \`apim_chat_completions_url_template\`

${apimRoutingNote}

Treat the gateway as an optional preview-shaped integration layer and validate
the policies you need before using it in a real environment.

## Services

${serviceTable}

## Project Structure

\`\`\`text
${strategyRepoPath}/
├── agent/              # Agent service source code
├── api/                # Business API source code
├── azcred/             # Az credential sidecar (serves tokens via HTTP)
├── frontend/           # React frontend + BFF server source code
├── infra/              # Terraform for the app-platform deployment
├── contracts/          # OpenAPI specifications
├── docker-compose.yml  # Local development compose
├── .env.example        # Environment variable template${config.language === 'typescript' ? '\n├── tsconfig.base.json  # Shared TypeScript configuration' : ''}
├── strategy.provenance.json # Strategy metadata/provenance
└── README.md           # This file
\`\`\`

## Environment Variables

### Required

${requiredEnvTable}

### Optional

${optionalEnvTable}

## Troubleshooting

### Containers fail to start

Check build logs: \`docker compose logs <service-name>\`

### Health checks failing

Services have a 10s start period. If builds are slow, wait or increase timeout.

### Port conflicts

If ports ${agent.manifest.port}, ${api.manifest.port}, or ${frontend.manifest.port} are in use, stop the conflicting service or modify the port mappings in \`docker-compose.yml\`.

## Authentication

This deployment strategy uses \`DefaultAzureCredential\` for Azure authentication. Credentials are provided
to containers via the **az credential sidecar** — a TypeScript HTTP server that
serves Azure CLI tokens to app containers.

### Setup

\`\`\`bash
# Create the Docker volume and log in (one-time)
docker volume create azurecli
docker run -it --rm -v azurecli:/root/.azure mcr.microsoft.com/azure-cli az login --use-device-code
\`\`\`

### Verify

\`\`\`bash
# Check which identity is being used
curl http://localhost:${agent.manifest.port}/identity
curl http://localhost:${api.manifest.port}/identity
\`\`\`

### How it works

The az credential sidecar mounts the \`azurecli\` Docker volume (containing your Azure CLI
token cache) and serves tokens via HTTP. App containers set \`IDENTITY_ENDPOINT\` and
\`IMDS_ENDPOINT\` environment variables, which \`DefaultAzureCredential\`'s
\`ManagedIdentityCredential\` chain detects automatically.

For production deployments on Azure Container Apps, real managed identity is used instead.
`;
}

// ---------------------------------------------------------------------------
// .gitignore
// ---------------------------------------------------------------------------

export function generateGitignore(): string {
  return `# Dependencies
node_modules/

# Build output
dist/

# .NET build output
bin/
obj/

# Environment (contains secrets)
.env

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db

# TypeScript build info
*.tsbuildinfo

# Coverage
coverage/

# Terraform
.terraform/
*.tfstate
*.tfstate.*
.terraform.lock.hcl
infra/.deploy.auto.tfvars.json
`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a human-readable sample title from a SampleConfig. */
function formatSampleTitle(config: SampleConfig): string {
  const variant = formatSlugTitle(config.agentVariant);
  const lang = formatLanguageName(config.language);
  return `${lang} + ${variant} + ${config.infraVariant.toUpperCase()}`;
}

function formatSlugTitle(value: string): string {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatStrategyRepoPath(config: SampleConfig): string {
  return `deployment-strategies/${config.relativeDir}`;
}

function renderMarkdownTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => (row[index] ?? '').length))
  );

  const renderRow = (cells: readonly string[]) =>
    `| ${cells.map((cell, index) => (cell ?? '').padEnd(widths[index] ?? 0)).join(' | ')} |`;
  const separator = `|${widths.map((width) => '-'.repeat(width + 2)).join('|')}|`;

  return [renderRow(headers), separator, ...rows.map(renderRow)].join('\n');
}

/** Format a language identifier into a human-readable name. */
function formatLanguageName(language: string): string {
  const names: Record<string, string> = {
    typescript: 'TypeScript',
    csharp: 'C#',
    python: 'Python',
    java: 'Java'
  };
  return names[language] ?? language.charAt(0).toUpperCase() + language.slice(1);
}

/**
 * Generate all files for a sample (excluding copied component contents).
 * Returns a Map of relative file path → content.
 */
export function generateSampleFiles(config: SampleConfig, tsconfigBaseContent: string): Map<string, string> {
  const files = new Map<string, string>();

  files.set('docker-compose.yml', generateComposeFile(config));
  files.set('.env.example', generateEnvExample(config));
  files.set('README.md', generateReadme(config));
  files.set(
    'strategy.provenance.json',
    JSON.stringify(
      {
        strategyName: config.name,
        strategyPath: formatStrategyRepoPath(config),
        derivedFromReferenceArchitecture: config.referenceArchitecture.manifest.id,
        referenceArchitecture: {
          id: config.referenceArchitecture.manifest.id,
          displayName: config.referenceArchitecture.manifest.displayName
        },
        infrastructure: {
          componentVariant: config.iac.manifest.variant ?? null,
          strategySuffix: config.infraVariant
        },
        flavor: {
          language: config.language,
          agentVariant: config.agentVariant
        }
      },
      null,
      2
    ) + '\n'
  );
  files.set('.gitignore', generateGitignore());

  // Only include tsconfig.base.json for samples that have TypeScript components
  // (frontend is always TypeScript, but the agent/api may be C# or other)
  // The frontend tsconfig needs it, so always include for now since frontend
  // is always TypeScript. Skip only if no component needs it.
  const hasTypeScriptComponents =
    config.language === 'typescript' || config.frontend.manifest.language === 'typescript';

  if (hasTypeScriptComponents) {
    files.set('tsconfig.base.json', tsconfigBaseContent);
  }

  return files;
}

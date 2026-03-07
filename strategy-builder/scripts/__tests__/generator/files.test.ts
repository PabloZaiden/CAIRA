import { describe, expect, it } from 'vitest';
import {
  generateComposeFile,
  generateEnvExample,
  generateReadme,
  generateGitignore,
  generateSampleFiles
} from '../../lib/generator/files.ts';
import type { DiscoveredComponent, SampleConfig } from '../../lib/generator/types.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFoundryConfig(): SampleConfig {
  const agent: DiscoveredComponent = {
    manifest: {
      name: 'agent',
      type: 'agent',
      variant: 'foundry-agent-service',
      language: 'typescript',
      description: 'Agent container using Azure AI Foundry (AI Projects v2 SDK)',
      port: 3000,
      healthEndpoint: '/health',
      requiredEnv: ['AZURE_AI_PROJECT_ENDPOINT'],
      optionalEnv: [
        'PORT',
        'HOST',
        'AGENT_MODEL',
        'AGENT_NAME',
        'TRIAGE_INSTRUCTIONS',
        'SHANTY_INSTRUCTIONS',
        'TREASURE_INSTRUCTIONS',
        'CREW_INSTRUCTIONS',
        'LOG_LEVEL',
        'SKIP_AUTH'
      ],
      contractSpec: 'contracts/agent-api.openapi.yaml'
    },
    dir: '/repo/components/agent/typescript/foundry-agent-service',
    relPath: 'components/agent/typescript/foundry-agent-service'
  };

  const api: DiscoveredComponent = {
    manifest: {
      name: 'api',
      type: 'api',
      language: 'typescript',
      description: 'Business API',
      port: 4000,
      healthEndpoint: '/health',
      requiredEnv: ['AGENT_SERVICE_URL'],
      optionalEnv: ['PORT', 'HOST', 'AGENT_TOKEN_SCOPE', 'CORS_ORIGIN', 'LOG_LEVEL', 'SKIP_AUTH'],
      contractSpec: 'contracts/backend-api.openapi.yaml'
    },
    dir: '/repo/components/api/typescript',
    relPath: 'components/api/typescript'
  };

  const frontend: DiscoveredComponent = {
    manifest: {
      name: 'frontend',
      type: 'frontend',
      variant: 'react-typescript',
      language: 'typescript',
      description: 'React/TypeScript chat UI',
      port: 8080,
      healthEndpoint: '/health',
      requiredEnv: ['API_BASE_URL'],
      optionalEnv: [],
      contractSpec: 'contracts/backend-api.openapi.yaml'
    },
    dir: '/repo/components/frontend/react-typescript',
    relPath: 'components/frontend/react-typescript'
  };

  return {
    name: 'typescript-foundry-agent-service',
    language: 'typescript',
    agentVariant: 'foundry-agent-service',
    agent,
    api,
    frontend
  };
}

function makeOpenAIConfig(): SampleConfig {
  const config = makeFoundryConfig();
  return {
    ...config,
    name: 'typescript-openai-agent-sdk',
    agentVariant: 'openai-agent-sdk',
    agent: {
      manifest: {
        name: 'agent',
        type: 'agent',
        variant: 'openai-agent-sdk',
        language: 'typescript',
        description: 'Agent container using OpenAI Agent SDK (Responses API)',
        port: 3000,
        healthEndpoint: '/health',
        requiredEnv: ['AZURE_OPENAI_ENDPOINT'],
        optionalEnv: [
          'PORT',
          'HOST',
          'AZURE_OPENAI_API_VERSION',
          'AGENT_MODEL',
          'AGENT_NAME',
          'TRIAGE_INSTRUCTIONS',
          'SHANTY_INSTRUCTIONS',
          'TREASURE_INSTRUCTIONS',
          'CREW_INSTRUCTIONS',
          'LOG_LEVEL',
          'SKIP_AUTH'
        ],
        contractSpec: 'contracts/agent-api.openapi.yaml'
      },
      dir: '/repo/components/agent/typescript/openai-agent-sdk',
      relPath: 'components/agent/typescript/openai-agent-sdk'
    }
  };
}

// ---------------------------------------------------------------------------
// docker-compose.yml
// ---------------------------------------------------------------------------

describe('generateComposeFile', () => {
  it('generates valid compose with local build contexts', () => {
    const content = generateComposeFile(makeFoundryConfig());

    expect(content).toContain('context: ./frontend');
    expect(content).toContain('context: ./api');
    expect(content).toContain('context: ./agent');
    // Must NOT reference monorepo paths
    expect(content).not.toContain('../../');
    expect(content).not.toContain('components/');
  });

  it('includes correct ports for all services', () => {
    const content = generateComposeFile(makeFoundryConfig());

    expect(content).toContain('"8080:8080"');
    expect(content).toContain('"4000:4000"');
    expect(content).toContain('"3000:3000"');
  });

  it('includes health checks with 127.0.0.1', () => {
    const content = generateComposeFile(makeFoundryConfig());

    // Should use 127.0.0.1, not localhost (IPv6 issue)
    expect(content).toContain('http://127.0.0.1:8080/health');
    expect(content).toContain('http://127.0.0.1:4000/health');
    expect(content).toContain('http://127.0.0.1:3000/health');
    expect(content).not.toContain('localhost');
  });

  it('includes agent-specific env vars for foundry', () => {
    const content = generateComposeFile(makeFoundryConfig());

    expect(content).toContain('AZURE_AI_PROJECT_ENDPOINT');
    expect(content).toContain('AGENT_MODEL');
    expect(content).not.toContain('AZURE_OPENAI_ENDPOINT');
  });

  it('includes agent-specific env vars for openai', () => {
    const content = generateComposeFile(makeOpenAIConfig());

    expect(content).toContain('AZURE_OPENAI_ENDPOINT');
    expect(content).toContain('AZURE_OPENAI_API_VERSION');
    expect(content).toContain('AGENT_MODEL');
    expect(content).not.toContain('AZURE_AI_PROJECT_ENDPOINT');
  });

  it('includes API service with AGENT_SERVICE_URL', () => {
    const content = generateComposeFile(makeFoundryConfig());

    expect(content).toContain('AGENT_SERVICE_URL: http://agent:3000');
  });

  it('uses caira-net network', () => {
    const content = generateComposeFile(makeFoundryConfig());

    expect(content).toContain('caira-net');
    expect(content).toContain('driver: bridge');
  });

  it('frontend depends on api, api depends on agent', () => {
    const content = generateComposeFile(makeFoundryConfig());

    // Check service dependency ordering (rough structural check)
    const frontendSection = content.indexOf('frontend:');
    const apiSection = content.indexOf('  api:');
    const agentSection = content.indexOf('  agent:');

    expect(frontendSection).toBeLessThan(apiSection);
    expect(apiSection).toBeLessThan(agentSection);
  });

  it('does not bind-mount host paths (only named volumes for azcred)', () => {
    const content = generateComposeFile(makeFoundryConfig());

    // Should not contain host bind-mounts like - ./foo:/bar
    expect(content).not.toMatch(/-\s+\.\//);
    // Should contain the azurecli named volume for azcred
    expect(content).toContain('azurecli:');
    expect(content).toContain('external: true');
  });

  it('includes frontend environment with API_BASE_URL', () => {
    const content = generateComposeFile(makeFoundryConfig());

    expect(content).toContain('API_BASE_URL: http://api:4000');
  });

  it('includes SKIP_AUTH on agent and api but does not include HOST in compose', () => {
    const content = generateComposeFile(makeFoundryConfig());

    // SKIP_AUTH is always set — local compose is for dev, not production
    expect(content).toMatch(/^\s+SKIP_AUTH: "true"/m);
    // HOST is an internal var, not for compose
    expect(content).not.toMatch(/^\s+HOST:/m);
  });

  it('includes azcred service with build context and azurecli volume', () => {
    const content = generateComposeFile(makeFoundryConfig());

    expect(content).toContain('azcred:');
    expect(content).toContain('context: ./azcred');
    expect(content).toContain('azurecli:/app/.azure');
  });

  it('sets IDENTITY_ENDPOINT and IMDS_ENDPOINT on agent and api', () => {
    const content = generateComposeFile(makeFoundryConfig());

    expect(content).toContain('IDENTITY_ENDPOINT: http://azcred:8079/token');
    expect(content).toContain('IMDS_ENDPOINT: dummy_required_value');
  });

  it('agent and api depend on azcred', () => {
    const content = generateComposeFile(makeFoundryConfig());

    // Both agent and api should have azcred in their depends_on
    const agentSection = content.substring(content.indexOf('  agent:'));
    const apiSection = content.substring(content.indexOf('  api:'), content.indexOf('  agent:'));

    expect(agentSection).toContain('azcred:');
    expect(apiSection).toContain('azcred:');
  });
});

// ---------------------------------------------------------------------------
// .env.example
// ---------------------------------------------------------------------------

describe('generateEnvExample', () => {
  it('includes required env vars for foundry', () => {
    const content = generateEnvExample(makeFoundryConfig());
    expect(content).toContain('AZURE_AI_PROJECT_ENDPOINT=');
  });

  it('includes required env vars for openai', () => {
    const content = generateEnvExample(makeOpenAIConfig());
    expect(content).toContain('AZURE_OPENAI_ENDPOINT=');
  });

  it('includes optional env vars with defaults', () => {
    const content = generateEnvExample(makeFoundryConfig());
    expect(content).toContain('AGENT_MODEL=gpt-5.2-chat');
  });

  it('includes LOG_LEVEL', () => {
    const content = generateEnvExample(makeFoundryConfig());
    expect(content).toContain('LOG_LEVEL=debug');
  });

  it('includes DefaultAzureCredential note', () => {
    const content = generateEnvExample(makeFoundryConfig());
    expect(content).toContain('DefaultAzureCredential');
  });

  it('does not include PORT, HOST, or SKIP_AUTH', () => {
    const content = generateEnvExample(makeFoundryConfig());
    expect(content).not.toMatch(/^PORT=/m);
    expect(content).not.toMatch(/^HOST=/m);
    expect(content).not.toMatch(/^SKIP_AUTH=/m);
  });
});

// ---------------------------------------------------------------------------
// README.md
// ---------------------------------------------------------------------------

describe('generateReadme', () => {
  it('includes sample title', () => {
    const content = generateReadme(makeFoundryConfig());
    expect(content).toContain('Foundry Agent Service');
  });

  it('includes architecture diagram with correct ports', () => {
    const content = generateReadme(makeFoundryConfig());
    expect(content).toContain(':8080');
    expect(content).toContain(':4000');
    expect(content).toContain(':3000');
  });

  it('includes quick start instructions', () => {
    const content = generateReadme(makeFoundryConfig());
    expect(content).toContain('cp .env.example .env');
    expect(content).toContain('docker compose up --build');
    expect(content).toContain('az login');
  });

  it('includes services table', () => {
    const content = generateReadme(makeFoundryConfig());
    expect(content).toContain('| Frontend');
    expect(content).toContain('| API');
    expect(content).toContain('| Agent');
  });

  it('includes project structure', () => {
    const content = generateReadme(makeFoundryConfig());
    expect(content).toContain('agent/');
    expect(content).toContain('api/');
    expect(content).toContain('frontend/');
    expect(content).toContain('infra/');
    expect(content).toContain('docker-compose.yml');
  });

  it('includes Azure deployment command section', () => {
    const content = generateReadme(makeFoundryConfig());
    expect(content).toContain('npm run deploy:strategy -- deployment-strategies/typescript-foundry-agent-service');
    expect(content).toContain('Ensures CAIRA is deployed');
    expect(content).toContain('curl ifconfig.io');
    expect(content).toContain('managed identity auth');
    expect(content).toContain('HTTPS termination');
  });

  it('includes environment variables section', () => {
    const content = generateReadme(makeFoundryConfig());
    expect(content).toContain('AZURE_AI_PROJECT_ENDPOINT');
  });

  it('includes troubleshooting section', () => {
    const content = generateReadme(makeFoundryConfig());
    expect(content).toContain('Troubleshooting');
    expect(content).toContain('Port conflicts');
  });

  it('mentions self-contained', () => {
    const content = generateReadme(makeFoundryConfig());
    expect(content).toContain('self-contained');
  });
});

// ---------------------------------------------------------------------------
// .gitignore
// ---------------------------------------------------------------------------

describe('generateGitignore', () => {
  it('excludes node_modules', () => {
    expect(generateGitignore()).toContain('node_modules/');
  });

  it('excludes .env', () => {
    expect(generateGitignore()).toContain('.env');
  });

  it('excludes dist', () => {
    expect(generateGitignore()).toContain('dist/');
  });

  it('excludes Terraform state and lock files', () => {
    const content = generateGitignore();
    expect(content).toContain('.terraform/');
    expect(content).toContain('*.tfstate');
    expect(content).toContain('.terraform.lock.hcl');
  });
});

// ---------------------------------------------------------------------------
// generateSampleFiles (all-in-one)
// ---------------------------------------------------------------------------

describe('generateSampleFiles', () => {
  const tsconfigBase = '{ "compilerOptions": { "target": "ES2024" } }';

  it('generates all expected files', () => {
    const files = generateSampleFiles(makeFoundryConfig(), tsconfigBase);

    expect(files.has('docker-compose.yml')).toBe(true);
    expect(files.has('.env.example')).toBe(true);
    expect(files.has('README.md')).toBe(true);
    expect(files.has('.gitignore')).toBe(true);
    expect(files.has('tsconfig.base.json')).toBe(true);
    // nginx.conf is no longer generated (frontend is a BFF)
    expect(files.has('nginx.conf')).toBe(false);
  });

  it('passes through tsconfig.base.json content', () => {
    const files = generateSampleFiles(makeFoundryConfig(), tsconfigBase);
    expect(files.get('tsconfig.base.json')).toBe(tsconfigBase);
  });

  it('generates different compose files for different variants', () => {
    const foundry = generateSampleFiles(makeFoundryConfig(), tsconfigBase);
    const openai = generateSampleFiles(makeOpenAIConfig(), tsconfigBase);

    expect(foundry.get('docker-compose.yml')).not.toBe(openai.get('docker-compose.yml'));
    expect(foundry.get('.env.example')).not.toBe(openai.get('.env.example'));
    expect(foundry.get('README.md')).not.toBe(openai.get('README.md'));
  });

  it('generates identical .gitignore for both variants', () => {
    const foundry = generateSampleFiles(makeFoundryConfig(), tsconfigBase);
    const openai = generateSampleFiles(makeOpenAIConfig(), tsconfigBase);

    expect(foundry.get('.gitignore')).toBe(openai.get('.gitignore'));
  });
});

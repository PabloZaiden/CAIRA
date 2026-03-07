/**
 * Configuration loader for the API container.
 *
 * Reads environment variables and validates required settings.
 * Fails fast if required variables are missing.
 */

export interface Config {
  /** Server port */
  readonly port: number;
  /** Server bind address */
  readonly host: string;
  /** Base URL of the agent container (e.g., http://localhost:3000) */
  readonly agentServiceUrl: string;
  /** Azure AD token scope for agent auth (e.g., api://<client-id>/.default) */
  readonly agentTokenScope: string | undefined;
  /** Pino log level */
  readonly logLevel: string;
  /** Skip token acquisition (for local dev with mocks) */
  readonly skipAuth: boolean;
}

/**
 * Load configuration from environment variables.
 * Throws if required variables are missing.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const agentServiceUrl = env['AGENT_SERVICE_URL'];
  if (!agentServiceUrl) {
    throw new Error(
      'AGENT_SERVICE_URL environment variable is required. ' +
        'Set it to the base URL of the agent container (e.g., http://localhost:3000).'
    );
  }

  // Strip trailing slash for consistency
  const normalizedUrl = agentServiceUrl.replace(/\/+$/, '');

  return {
    port: parseInt(env['PORT'] ?? '4000', 10),
    host: env['HOST'] ?? '0.0.0.0',
    agentServiceUrl: normalizedUrl,
    agentTokenScope: env['AGENT_TOKEN_SCOPE'],
    logLevel: env['LOG_LEVEL'] ?? 'debug',
    skipAuth: env['SKIP_AUTH'] === 'true'
  };
}

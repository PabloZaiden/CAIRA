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
  /** Tenant ID used to validate inbound Entra access tokens */
  readonly inboundAuthTenantId: string | undefined;
  /** Accepted audiences for inbound access tokens */
  readonly inboundAuthAllowedAudiences: readonly string[];
  /** Optional allowlist of caller application IDs (`azp` or `appid`) */
  readonly inboundAuthAllowedCallerAppIds: readonly string[];
  /** Authority host for Entra metadata and issuer validation */
  readonly inboundAuthAuthorityHost: string;
  /** Application Insights connection string for Azure Monitor OTEL export */
  readonly applicationInsightsConnectionString: string | undefined;
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
  const skipAuth = env['SKIP_AUTH'] === 'true';
  const inboundAuthTenantId = env['INBOUND_AUTH_TENANT_ID'];
  const inboundAuthAllowedAudiences = (env['INBOUND_AUTH_ALLOWED_AUDIENCES'] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const inboundAuthAllowedCallerAppIds = (env['INBOUND_AUTH_ALLOWED_CALLER_APP_IDS'] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const inboundAuthAuthorityHost = (env['INBOUND_AUTH_AUTHORITY_HOST'] ?? 'https://login.microsoftonline.com').replace(
    /\/+$/,
    ''
  );
  const agentTokenScope = env['AGENT_TOKEN_SCOPE'];

  if (!skipAuth) {
    if (!agentTokenScope) {
      throw new Error(
        'AGENT_TOKEN_SCOPE environment variable is required when SKIP_AUTH is not true. ' +
          'Set it to the Entra scope used by the API when calling the agent container.'
      );
    }

    if (!inboundAuthTenantId) {
      throw new Error(
        'INBOUND_AUTH_TENANT_ID environment variable is required when SKIP_AUTH is not true. ' +
          'Set it to the Entra tenant ID expected to issue BFF -> API access tokens.'
      );
    }

    if (inboundAuthAllowedAudiences.length === 0) {
      throw new Error(
        'INBOUND_AUTH_ALLOWED_AUDIENCES environment variable is required when SKIP_AUTH is not true. ' +
          'Set it to a comma-separated list of accepted API audiences.'
      );
    }
  }

  return {
    port: parseInt(env['PORT'] ?? '4000', 10),
    host: env['HOST'] ?? '0.0.0.0',
    agentServiceUrl: normalizedUrl,
    agentTokenScope,
    inboundAuthTenantId,
    inboundAuthAllowedAudiences,
    inboundAuthAllowedCallerAppIds,
    inboundAuthAuthorityHost,
    applicationInsightsConnectionString: env['APPLICATIONINSIGHTS_CONNECTION_STRING'],
    logLevel: env['LOG_LEVEL'] ?? 'debug',
    skipAuth
  };
}

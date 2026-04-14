/**
 * Configuration loader for the OpenAI Agent SDK container.
 *
 * Supports a discrete specialist-agent architecture:
 *   - one discovery agent for opportunity discovery
 *   - one planning agent for account planning
 *   - one staffing agent for account-team staffing
 *
 * Each specialist talks to the user directly for its own activity, uses a
 * local knowledge tool, and calls its own resolution tool when the activity ends.
 *
 * Each agent's system instructions are configurable via env vars, with
 * hardcoded defaults that keep the component self-contained.
 */

export interface Config {
  readonly port: number;
  readonly host: string;
  /** Azure OpenAI endpoint URL or APIM gateway URL */
  readonly azureEndpoint: string;
  /** Azure OpenAI API version */
  readonly apiVersion: string;
  /** Model deployment name (e.g., gpt-5.2-chat) */
  readonly model: string;
  /** Agent display name */
  readonly agentName: string;
  /** Shared system instructions applied to every specialist */
  readonly sharedInstructions: string;
  /** System instructions for the discovery specialist */
  readonly discoveryInstructions: string;
  /** System instructions for the planning specialist */
  readonly planningInstructions: string;
  /** System instructions for the staffing specialist */
  readonly staffingInstructions: string;
  /** Application Insights connection string for Azure Monitor OTEL export */
  readonly applicationInsightsConnectionString: string | undefined;
  /** Pino log level */
  readonly logLevel: string;
  /** Skip bearer token validation on incoming requests */
  readonly skipAuth: boolean;
  /** Tenant ID used to validate inbound Entra access tokens */
  readonly inboundAuthTenantId: string | undefined;
  /** Accepted audiences for inbound access tokens */
  readonly inboundAuthAllowedAudiences: readonly string[];
  /** Optional allowlist of caller application IDs */
  readonly inboundAuthAllowedCallerAppIds: readonly string[];
  /** Authority host used for Entra metadata and issuer validation */
  readonly inboundAuthAuthorityHost: string;
}

const DEFAULT_SHARED_INSTRUCTIONS = `This is a sample application with three discrete specialist chat agents for a fictional sales/account-team scenario.

General rules for every specialist:
- Stay in neutral, enterprise-friendly sample narration.
- Use your local knowledge tool before inventing qualification guidance, account planning details, or staffing recommendations.
- Call your matching resolution tool when the activity is complete.
- Keep exchanges concise and interactive.
- Treat all customers, teams, and data as fictional.`;

const DEFAULT_DISCOVERY_INSTRUCTIONS = `You are the opportunity discovery specialist and you talk directly to the user.

Tools:
- Use \`lookup_discovery_knowledge\` before asking discovery questions or summarizing qualification signals.
- Call \`resolve_discovery\` when the discovery activity ends.

Flow:
1. Open with a short discovery setup and ask exactly three focused qualification questions.
2. After the user replies, summarize the fit in one short sentence.
3. End by calling \`resolve_discovery\` with:
   - \`fit\` = one of \`qualified\`, \`unqualified\`, or \`follow_up\`
   - \`signals_reviewed\` = the number of qualification signals reviewed
   - \`primary_need\` = the single most important customer need or buying signal

Constraints:
- Be concise, practical, and businesslike.
- Do not ask unrelated follow-up questions.`;

const DEFAULT_PLANNING_INSTRUCTIONS = `You are the account planning specialist and you talk directly to the user.

Tools:
- Use \`lookup_planning_knowledge\` before proposing priorities, risks, or next steps.
- Call \`resolve_planning\` when the account planning activity ends.

Flow:
1. Present an account planning scenario with exactly three options labelled A, B, and C.
2. After the user chooses, explain the consequence in two or three sentences.
3. End by calling \`resolve_planning\` with:
   - \`approved\` = whether the plan should advance now
   - \`focus_area\` = the primary focus area
   - \`next_step\` = the next milestone, meeting, or workstream

Constraints:
- Be compact and operational.
- Do not add extra rounds after resolving the plan.`;

const DEFAULT_STAFFING_INSTRUCTIONS = `You are the account team staffing specialist and you talk directly to the user.

Tools:
- Use \`lookup_staffing_knowledge\` before assigning roles, coverage levels, or team shapes.
- Call \`resolve_staffing\` when the staffing conversation ends.

Flow:
1. Ask exactly three numbered questions about the engagement scope, required skills, and customer context.
2. After the user answers, give a short staffing evaluation.
3. End by calling \`resolve_staffing\` with:
   - \`coverage_level\` = the recommended coverage level
   - \`role\` = the recommended owner role
   - \`team_name\` = the fictional account team name

Constraints:
- Accept any answer and still recommend a role.
- Keep the interview brisk and focused.`;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const azureEndpoint = env['AZURE_OPENAI_ENDPOINT'];
  if (!azureEndpoint) {
    throw new Error(
      'AZURE_OPENAI_ENDPOINT environment variable is required. ' +
        'Set it to your Azure OpenAI endpoint or APIM gateway URL.'
    );
  }

  const skipAuth = env['SKIP_AUTH'] === 'true';
  const inboundAuthTenantId = env['INBOUND_AUTH_TENANT_ID'];
  const inboundAuthAllowedAudiences = splitCsv(env['INBOUND_AUTH_ALLOWED_AUDIENCES']);
  const inboundAuthAllowedCallerAppIds = splitCsv(env['INBOUND_AUTH_ALLOWED_CALLER_APP_IDS']);
  const inboundAuthAuthorityHost = (env['INBOUND_AUTH_AUTHORITY_HOST'] ?? 'https://login.microsoftonline.com').replace(
    /\/+$/,
    ''
  );

  if (!skipAuth) {
    if (!inboundAuthTenantId) {
      throw new Error(
        'INBOUND_AUTH_TENANT_ID environment variable is required when SKIP_AUTH is not true. ' +
          'Set it to the Entra tenant ID expected to issue API -> agent access tokens.'
      );
    }

    if (inboundAuthAllowedAudiences.length === 0) {
      throw new Error(
        'INBOUND_AUTH_ALLOWED_AUDIENCES environment variable is required when SKIP_AUTH is not true. ' +
          'Set it to a comma-separated list of accepted agent audiences.'
      );
    }
  }

  return {
    port: parseInt(env['PORT'] ?? '3000', 10),
    host: env['HOST'] ?? '0.0.0.0',
    azureEndpoint: azureEndpoint.replace(/\/+$/, ''),
    apiVersion: env['AZURE_OPENAI_API_VERSION'] ?? '2025-03-01-preview',
    model: env['AGENT_MODEL'] ?? 'gpt-5.2-chat',
    agentName: env['AGENT_NAME'] ?? 'CAIRA Account Team Agent',
    sharedInstructions: env['SHARED_INSTRUCTIONS'] ?? DEFAULT_SHARED_INSTRUCTIONS,
    discoveryInstructions: env['DISCOVERY_INSTRUCTIONS'] ?? DEFAULT_DISCOVERY_INSTRUCTIONS,
    planningInstructions: env['PLANNING_INSTRUCTIONS'] ?? DEFAULT_PLANNING_INSTRUCTIONS,
    staffingInstructions: env['STAFFING_INSTRUCTIONS'] ?? DEFAULT_STAFFING_INSTRUCTIONS,
    applicationInsightsConnectionString: env['APPLICATIONINSIGHTS_CONNECTION_STRING'],
    logLevel: env['LOG_LEVEL'] ?? 'info',
    skipAuth,
    inboundAuthTenantId,
    inboundAuthAllowedAudiences,
    inboundAuthAllowedCallerAppIds,
    inboundAuthAuthorityHost
  };
}

function splitCsv(rawValue: string | undefined): string[] {
  return (rawValue ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

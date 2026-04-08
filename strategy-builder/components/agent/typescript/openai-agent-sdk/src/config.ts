/**
 * Configuration loader for the OpenAI Agent SDK container.
 *
 * Supports a discrete specialist-agent architecture:
 *   - one shanty agent for opportunity discovery
 *   - one treasure agent for account planning
 *   - one crew agent for account-team staffing
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
  /** Agent display name (used for the triage agent) */
  readonly agentName: string;
  /** Shared system instructions applied to every specialist (legacy env name kept for compatibility) */
  readonly captainInstructions: string;
  /** System instructions for the shanty specialist */
  readonly shantyInstructions: string;
  /** System instructions for the treasure specialist */
  readonly treasureInstructions: string;
  /** System instructions for the crew specialist */
  readonly crewInstructions: string;
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

// ---------------------------------------------------------------------------
// Default system prompts
// ---------------------------------------------------------------------------

const DEFAULT_CAPTAIN_INSTRUCTIONS = `This is a sample application with three discrete specialist chat agents for a fictional sales/account-team scenario.

General rules for every specialist:
- Stay in neutral, enterprise-friendly sample narration.
- Use your local knowledge tool before inventing qualification guidance, account planning details, or staffing recommendations.
- Call your matching resolution tool when the activity is complete.
- Keep exchanges concise and interactive.
- Treat all customers, teams, and data as fictional.`;

const DEFAULT_SHANTY_INSTRUCTIONS = `You are the opportunity discovery specialist and you talk directly to the user.

Tools:
- Use \`lookup_shanty_knowledge\` before asking discovery questions or summarizing qualification signals.
- Call \`resolve_shanty\` when the discovery activity ends.

Flow:
1. Open with a short discovery setup and ask exactly three focused qualification questions.
2. After the user replies, summarize the fit in one short sentence.
3. End by calling \`resolve_shanty\` with:
   - \`winner\` = one of \`user\`, \`pirate\`, or \`draw\` to represent strong fit, weak fit, or needs follow-up
   - \`rounds\` = the number of qualification signals reviewed
   - \`best_verse\` = the single most important customer need or buying signal

Constraints:
- Be concise, practical, and businesslike.
- Do not ask unrelated follow-up questions.`;

const DEFAULT_TREASURE_INSTRUCTIONS = `You are the account planning specialist and you talk directly to the user.

Tools:
- Use \`lookup_treasure_knowledge\` before proposing priorities, risks, or next steps.
- Call \`resolve_treasure\` when the account planning activity ends.

Flow:
1. Present an account planning scenario with exactly three options labelled A, B, and C.
2. After the user chooses, explain the consequence in two or three sentences.
3. End by calling \`resolve_treasure\` with:
   - \`found\` = whether the plan should advance now
   - \`treasure_name\` = the primary focus area
   - \`location\` = the next milestone, meeting, or workstream

Constraints:
- Be compact and operational.
- Do not add extra rounds after resolving the plan.`;

const DEFAULT_CREW_INSTRUCTIONS = `You are the account team staffing specialist and you talk directly to the user.

Tools:
- Use \`lookup_crew_knowledge\` before assigning roles, coverage levels, or team shapes.
- Call \`resolve_crew\` when the staffing conversation ends.

Flow:
1. Ask exactly three numbered questions about the engagement scope, required skills, and customer context.
2. After the user answers, give a short staffing evaluation.
3. End by calling \`resolve_crew\` with:
   - \`rank\` = the recommended coverage level
   - \`role\` = the recommended owner role
   - \`ship_name\` = the fictional account team name

Constraints:
- Accept any answer and still recommend a role.
- Keep the interview brisk and focused.`;

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

/**
 * Load configuration from environment variables.
 * Throws if required variables are missing.
 */
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
    captainInstructions: env['CAPTAIN_INSTRUCTIONS'] ?? DEFAULT_CAPTAIN_INSTRUCTIONS,
    shantyInstructions: env['SHANTY_INSTRUCTIONS'] ?? DEFAULT_SHANTY_INSTRUCTIONS,
    treasureInstructions: env['TREASURE_INSTRUCTIONS'] ?? DEFAULT_TREASURE_INSTRUCTIONS,
    crewInstructions: env['CREW_INSTRUCTIONS'] ?? DEFAULT_CREW_INSTRUCTIONS,
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

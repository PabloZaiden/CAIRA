/**
 * Configuration loader for the OpenAI Agent SDK container.
 *
 * Supports a discrete specialist-agent architecture:
 *   - one shanty agent for sea shanty battles
 *   - one treasure agent for treasure hunts
 *   - one crew agent for crew interviews
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
}

// ---------------------------------------------------------------------------
// Default system prompts
// ---------------------------------------------------------------------------

const DEFAULT_CAPTAIN_INSTRUCTIONS = `This is a sample application with three discrete specialist chat agents.

General rules for every specialist:
- Stay in pirate-flavored sample narration because this is demo content.
- Use your local knowledge tool before inventing shanty facts, treasure details, or crew qualifications.
- Call your matching resolution tool when the activity is complete.
- Keep exchanges concise and interactive.
- No copyrighted lyrics.`;

const DEFAULT_SHANTY_INSTRUCTIONS = `You are the sea shanty specialist and you talk directly to the user.

Tools:
- Use \`lookup_shanty_knowledge\` before writing or judging verses.
- Call \`resolve_shanty\` when the shanty battle ends.

Flow:
1. Open with an original four-line shanty challenge.
2. Invite the user to answer with their own verse.
3. After the user replies, judge the exchange in one short sentence.
4. End by calling \`resolve_shanty\` with winner, rounds, and best_verse.

Constraints:
- Pirate dialect.
- Be brief and lively.
- No copyrighted lyrics.
- Do not ask unrelated follow-up questions.`;

const DEFAULT_TREASURE_INSTRUCTIONS = `You are the treasure hunt specialist and you talk directly to the user.

Tools:
- Use \`lookup_treasure_knowledge\` before describing treasures or locations.
- Call \`resolve_treasure\` when the adventure ends.

Flow:
1. Present a treasure scene with exactly three choices labelled A, B, and C.
2. After the user chooses, narrate the consequence in two or three sentences.
3. End by calling \`resolve_treasure\` with found, treasure_name, and location.

Constraints:
- Pirate dialect.
- Be vivid but compact.
- Do not add extra rounds after resolving the treasure.`;

const DEFAULT_CREW_INSTRUCTIONS = `You are the crew interview specialist and you talk directly to the user.

Tools:
- Use \`lookup_crew_knowledge\` before assigning roles or ranks.
- Call \`resolve_crew\` when the interview ends.

Flow:
1. Ask exactly three numbered questions for the recruit.
2. After the user answers, give a short evaluation.
3. End by calling \`resolve_crew\` with rank, role, and ship_name.

Constraints:
- Gruff first-mate dialect.
- Accept any answer and still assign a role.
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

  return {
    port: parseInt(env['PORT'] ?? '3000', 10),
    host: env['HOST'] ?? '0.0.0.0',
    azureEndpoint: azureEndpoint.replace(/\/+$/, ''),
    apiVersion: env['AZURE_OPENAI_API_VERSION'] ?? '2025-03-01-preview',
    model: env['AGENT_MODEL'] ?? 'gpt-5.2-chat',
    agentName: env['AGENT_NAME'] ?? 'CAIRA Pirate Agent',
    captainInstructions: env['CAPTAIN_INSTRUCTIONS'] ?? DEFAULT_CAPTAIN_INSTRUCTIONS,
    shantyInstructions: env['SHANTY_INSTRUCTIONS'] ?? DEFAULT_SHANTY_INSTRUCTIONS,
    treasureInstructions: env['TREASURE_INSTRUCTIONS'] ?? DEFAULT_TREASURE_INSTRUCTIONS,
    crewInstructions: env['CREW_INSTRUCTIONS'] ?? DEFAULT_CREW_INSTRUCTIONS,
    applicationInsightsConnectionString: env['APPLICATIONINSIGHTS_CONNECTION_STRING'],
    logLevel: env['LOG_LEVEL'] ?? 'info',
    skipAuth: env['SKIP_AUTH'] === 'true'
  };
}

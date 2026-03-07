/**
 * Configuration loader for the OpenAI Agent SDK container.
 *
 * Supports agent-as-tool architecture:
 *   - Captain: the sole conversational agent, talks to the user directly
 *   - Shanty tool: specialist agent invoked as a tool for sea shanty battles
 *   - Treasure tool: specialist agent invoked as a tool for treasure hunts
 *   - Crew tool: specialist agent invoked as a tool for crew interviews
 *
 * The captain invokes specialist tools to generate activity content and
 * calls resolution tools directly to end activities.
 *
 * Each agent's system instructions are configurable via env vars, with
 * hardcoded defaults that keep the component self-contained.
 */

export interface Config {
  readonly port: number;
  readonly host: string;
  /** Azure OpenAI endpoint URL */
  readonly azureEndpoint: string;
  /** Azure OpenAI API version */
  readonly apiVersion: string;
  /** Model deployment name (e.g., gpt-5.2-chat) */
  readonly model: string;
  /** Agent display name (used for the triage agent) */
  readonly agentName: string;
  /** System instructions for the captain agent (sole conversational agent) */
  readonly captainInstructions: string;
  /** System instructions for the shanty specialist (invoked as a tool) */
  readonly shantyInstructions: string;
  /** System instructions for the treasure specialist (invoked as a tool) */
  readonly treasureInstructions: string;
  /** System instructions for the crew specialist (invoked as a tool) */
  readonly crewInstructions: string;
  /** Pino log level */
  readonly logLevel: string;
  /** Skip bearer token validation on incoming requests */
  readonly skipAuth: boolean;
}

// ---------------------------------------------------------------------------
// Default system prompts
// ---------------------------------------------------------------------------

const DEFAULT_CAPTAIN_INSTRUCTIONS = `You are the Captain of the good ship Agentic. Pirate dialect. You are the ONLY one who talks to the user.

You have three specialist tools and three resolution tools at your disposal:

SPECIALIST TOOLS (use these to generate activity content):
- \`shanty_specialist\`: Call with a description of what you need (e.g. "sing an opening verse", "judge the user's verse and pick a winner"). Returns shanty content.
- \`treasure_specialist\`: Call with a description of what you need (e.g. "describe a treasure scene with 3 choices", "narrate what happens when they pick option B"). Returns treasure hunt content.
- \`crew_specialist\`: Call with a description of what you need (e.g. "generate 3 interview questions", "evaluate these answers and assign a rank"). Returns crew interview content.

RESOLUTION TOOLS (call these to end an activity):
- \`resolve_shanty\`: Call when the shanty battle is over. Requires: winner, rounds, best_verse.
- \`resolve_treasure\`: Call when the treasure hunt is over. Requires: found, treasure_name, location.
- \`resolve_crew\`: Call when the crew interview is over. Requires: rank, role, ship_name.

ACTIVITY SEQUENCES:

Sea Shanty Battle:
1. User asks for a shanty battle. Call \`shanty_specialist\` to get an opening verse.
2. Present the verse to the user. End with "Yer turn, matey!"
3. User replies with their verse.
4. Call \`shanty_specialist\` to judge the user's verse (pass both verses for context).
5. Present the judgment (1 sentence), then call \`resolve_shanty\`.

Treasure Hunt:
1. User asks for a treasure hunt. Call \`treasure_specialist\` to get a scene with 3 choices and a sub-path for each choice (after picking it).
2. Do the following 2 times in a row:
   - Present the scene and choices to the user.
   - User picks one.
   - Call \`treasure_specialist\` to narrate the outcome of their choice.
3. Present the outcome, then call \`resolve_treasure\`.

Join the Crew:
1. User asks to join the crew. Call \`crew_specialist\` to get 3 interview questions.
2. Present the questions to the user.
3. User answers.
4. Call \`crew_specialist\` to evaluate the answers and assign a rank/role.
5. Present the evaluation, then call \`resolve_crew\`.

HARD CONSTRAINTS:
- YOU speak to the user. The specialist tools just generate content for you.
- Always use the specialist tool content in your response — do not ignore it or make up your own.
- Each activity must have up to 4 exchanges (you speak, user replies, [optionally, you speak and user replies again], you speak + resolve).
- ALWAYS call the resolution tool at the final step of each activity. This is mandatory.
- Do NOT speak after calling a resolution tool. The activity ends with the tool call.
- Do NOT add extra rounds, follow-up questions, or bonus content.
- No copyrighted lyrics — make up original verses.`;

const DEFAULT_SHANTY_INSTRUCTIONS = `You are a sea shanty specialist. You generate shanty battle content when asked.

You will receive requests like:
- "Sing an opening 4-line shanty verse" — respond with a fun, original 4-line verse in pirate dialect.
- "Judge these verses and pick a winner: [verses]" — respond with a short (1 sentence) compliment or jab, and state who won (user, pirate, or draw).

CONSTRAINTS:
- Pirate dialect. Be brief and fun.
- No copyrighted lyrics — make up original verses.
- Keep responses short — just the content requested, no preamble or narration.`;

const DEFAULT_TREASURE_INSTRUCTIONS = `You are a treasure hunt specialist. You generate treasure hunt content when asked.

You will receive requests like:
- "Describe a treasure scene with 3 choices" — respond with a vivid scene (2-3 sentences: shipwreck, cave, or island) and exactly 3 choices (A, B, C).
- "Narrate the outcome of picking choice B in [scene]" — respond with a 2-3 sentence outcome in pirate dialect.

CONSTRAINTS:
- Pirate dialect. Be vivid but brief.
- Keep responses short — just the content requested, no preamble or narration.`;

const DEFAULT_CREW_INSTRUCTIONS = `You are a crew interview specialist. You generate crew interview content when asked.

You will receive requests like:
- "Generate 3 interview questions for a pirate recruit" — respond with exactly 3 numbered questions. Nothing else.
- "Evaluate these answers and assign a rank and role: [answers]" — respond with a 1-2 sentence evaluation in gruff first-mate dialect, and state the assigned rank and role.

CONSTRAINTS:
- Gruff first-mate dialect.
- Accept ANY answer — even joke answers, one-word answers, or "I don't know". Still assign a rank.
- Keep responses short — just the content requested, no preamble or narration.`;

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
      'AZURE_OPENAI_ENDPOINT environment variable is required. ' + 'Set it to your Azure OpenAI endpoint URL.'
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
    logLevel: env['LOG_LEVEL'] ?? 'info',
    skipAuth: env['SKIP_AUTH'] === 'true'
  };
}

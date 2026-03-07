/**
 * Agent setup — how to configure the OpenAI Agent SDK on Azure AI Foundry.
 *
 * This file is the "read this first" entry point for developers. It shows:
 *
 *   1. How to connect the SDK to Azure OpenAI via DefaultAzureCredential
 *   2. How to create agents with system instructions
 *   3. How to use .asTool() to compose agents into an agent-as-tool hierarchy
 *   4. How to define FunctionTools (resolution tools with Zod schemas)
 *
 * Architecture (agent-as-tool):
 *
 *   Captain agent (sole conversational agent — talks to the user)
 *     ├─ shanty_specialist   (Agent.asTool)
 *     ├─ treasure_specialist  (Agent.asTool)
 *     ├─ crew_specialist      (Agent.asTool)
 *     ├─ resolve_shanty       (FunctionTool)
 *     ├─ resolve_treasure     (FunctionTool)
 *     └─ resolve_crew         (FunctionTool)
 *
 * The captain orchestrates: it calls specialist tools for content generation
 * and resolution tools to end activities with structured outcomes.
 */

import { Agent, tool, setTracingDisabled, setDefaultOpenAIClient } from '@openai/agents';
import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { z } from 'zod';
import type { Config } from './config.ts';
import type { Logger } from './openai-client.ts';

// ---------------------------------------------------------------------------
// Resolution tool names (must match what prompts tell agents to call)
// ---------------------------------------------------------------------------

/** Resolution tool names — used to detect resolution from SDK output items. */
export const RESOLUTION_TOOLS = new Set(['resolve_shanty', 'resolve_treasure', 'resolve_crew']);

/** Specialist agent-tool names — emit tool.called/tool.done SSE events for these. */
export const SPECIALIST_TOOLS = new Set(['shanty_specialist', 'treasure_specialist', 'crew_specialist']);

// ---------------------------------------------------------------------------
// Resolution tool definitions
// ---------------------------------------------------------------------------

/**
 * Create the three resolution FunctionTools.  The execute handlers log and
 * return a human-readable string.  Resolution detection is done by scanning
 * SDK output items (run result / stream events), not via side-effects.
 */
function createResolutionTools(log: Logger) {
  const resolveShanty = tool({
    name: 'resolve_shanty',
    description: 'Call this when the Sea Shanty Battle concludes. Declares the winner and records the outcome.',
    parameters: z.object({
      winner: z.enum(['user', 'pirate', 'draw']).describe('Who won the shanty battle'),
      rounds: z.number().describe('Number of rounds completed'),
      best_verse: z.string().describe('The single best verse from the entire battle')
    }),
    execute: async (input) => {
      log.info(
        { tool: 'resolve_shanty', result: input },
        `Shanty battle resolved: ${input.winner} wins after ${input.rounds} rounds.`
      );
      return `Shanty battle resolved: ${input.winner} wins after ${input.rounds} rounds.`;
    }
  });

  const resolveTreasure = tool({
    name: 'resolve_treasure',
    description: 'Call this when the Treasure Hunt concludes. Records whether treasure was found and details.',
    parameters: z.object({
      found: z.boolean().describe('Whether the treasure was found'),
      treasure_name: z.string().describe('Name of the treasure'),
      location: z.string().describe('Where the treasure was found or lost')
    }),
    execute: async (input) => {
      log.info(
        { tool: 'resolve_treasure', result: input },
        `Treasure hunt resolved: ${input.found ? 'Found' : 'Lost'} "${input.treasure_name}" at ${input.location}.`
      );
      return `Treasure hunt resolved: ${input.found ? 'Found' : 'Lost'} "${input.treasure_name}" at ${input.location}.`;
    }
  });

  const resolveCrew = tool({
    name: 'resolve_crew',
    description: 'Call this when the crew interview concludes. Assigns a rank and role to the new crew member.',
    parameters: z.object({
      rank: z.string().describe('The assigned rank (e.g., Able Seaman, Quartermaster)'),
      role: z.string().describe('The assigned role (e.g., lookout, cook, navigator)'),
      ship_name: z.string().describe('The name of the ship they are joining')
    }),
    execute: async (input) => {
      log.info(
        { tool: 'resolve_crew', result: input },
        `Crew interview resolved: ${input.rank} ${input.role} aboard the ${input.ship_name}.`
      );
      return `Crew interview resolved: ${input.rank} ${input.role} aboard the ${input.ship_name}.`;
    }
  });

  return { resolveShanty, resolveTreasure, resolveCrew };
}

// ---------------------------------------------------------------------------
// Azure client setup
// ---------------------------------------------------------------------------

/**
 * Configure the OpenAI Agent SDK to use Azure OpenAI.
 *
 * The SDK uses a global default client set via `setDefaultOpenAIClient()`.
 * For Azure, we create an `AzureOpenAI` instance with a bearer token
 * provider from `@azure/identity`.
 *
 * Authentication modes:
 *   - HTTP endpoint + skipAuth (local dev / CI): uses a static dummy token
 *   - HTTPS endpoint (production): uses DefaultAzureCredential for real
 *     Azure AD tokens via the cognitiveservices scope
 */
export async function setupAzureClient(config: Config): Promise<void> {
  const isHttpEndpoint = config.azureEndpoint.startsWith('http://');
  let tokenProvider: () => Promise<string>;

  if (isHttpEndpoint && config.skipAuth) {
    tokenProvider = () => Promise.resolve('dummy');
  } else {
    const credential = new DefaultAzureCredential();
    tokenProvider = getBearerTokenProvider(credential, 'https://cognitiveservices.azure.com/.default');
  }

  const client = new AzureOpenAI({
    azureADTokenProvider: tokenProvider,
    apiVersion: config.apiVersion,
    endpoint: config.azureEndpoint
  });

  setDefaultOpenAIClient(client);
}

// ---------------------------------------------------------------------------
// Agent hierarchy creation
// ---------------------------------------------------------------------------

/**
 * Create the full agent-as-tool hierarchy and return the captain agent.
 *
 * The pattern:
 *   1. Create specialist agents with focused instructions
 *   2. Wrap each specialist as a tool via `.asTool()`
 *   3. Create a captain agent that has all tools (specialist + resolution)
 *   4. The captain is the sole conversational agent — all user messages
 *      go through it, and it delegates to specialists as needed
 */
export function createAgentHierarchy(config: Config, log: Logger): Agent {
  // Disable OpenAI tracing (not needed in this context)
  setTracingDisabled(true);

  // Create resolution tools (FunctionTools with Zod schemas)
  const { resolveShanty, resolveTreasure, resolveCrew } = createResolutionTools(log);

  // Create specialist agents — each has focused instructions for one activity
  const shantyAgent = new Agent({
    name: 'Shanty',
    instructions: config.shantyInstructions,
    model: config.model
  });

  const treasureAgent = new Agent({
    name: 'Treasure',
    instructions: config.treasureInstructions,
    model: config.model
  });

  const crewAgent = new Agent({
    name: 'Crew',
    instructions: config.crewInstructions,
    model: config.model
  });

  // Wrap specialists as tools via .asTool() — this is the key SDK pattern.
  // When the captain calls one of these tools, the SDK runs the specialist
  // agent internally and returns its output as the tool result.
  const shantyTool = shantyAgent.asTool({
    toolName: 'shanty_specialist',
    toolDescription: 'Call this tool to get sea shanty content — opening verses, verse judgments, etc.'
  });

  const treasureTool = treasureAgent.asTool({
    toolName: 'treasure_specialist',
    toolDescription: 'Call this tool to get treasure hunt content — scene descriptions, outcome narrations, etc.'
  });

  const crewTool = crewAgent.asTool({
    toolName: 'crew_specialist',
    toolDescription: 'Call this tool to get crew interview content — interview questions, answer evaluations, etc.'
  });

  // Create the captain agent — the sole conversational agent with all tools
  const captainAgent = new Agent({
    name: config.agentName,
    instructions: config.captainInstructions,
    model: config.model,
    modelSettings: {
      toolChoice: 'auto'
    },
    tools: [shantyTool, treasureTool, crewTool, resolveShanty, resolveTreasure, resolveCrew]
  });

  log.info({ model: config.model, agentName: config.agentName }, 'Agent hierarchy initialised');

  return captainAgent;
}

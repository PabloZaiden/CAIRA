/**
 * Agent setup — how to configure the OpenAI Agent SDK on Azure AI Foundry.
 *
 * This file is the "read this first" entry point for developers. It shows:
 *
 *   1. How to connect the SDK to Azure OpenAI via DefaultAzureCredential
 *   2. How to create agents with system instructions
 *   3. How to attach local knowledge tools and resolution tools to specialists
 *   4. How to pick a discrete specialist agent per conversation mode
 *
 * Architecture (discrete specialists):
 *
 *   Shanty agent    ─┬─ lookup_shanty_knowledge
 *                    └─ resolve_shanty
 *   Treasure agent  ─┬─ lookup_treasure_knowledge
 *                    └─ resolve_treasure
 *   Crew agent      ─┬─ lookup_crew_knowledge
 *                    └─ resolve_crew
 */

import { Agent, tool, setTracingDisabled, setDefaultOpenAIClient } from '@openai/agents';
import { AzureOpenAI } from 'openai';
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity';
import { z } from 'zod';
import type { Config } from './config.ts';
import type { Logger } from './openai-client.ts';
import { lookupCrewKnowledge, lookupShantyKnowledge, lookupTreasureKnowledge } from './knowledge-base.ts';

// ---------------------------------------------------------------------------
// Resolution tool names (must match what prompts tell agents to call)
// ---------------------------------------------------------------------------

/** Resolution tool names — used to detect resolution from SDK output items. */
export const RESOLUTION_TOOLS = new Set(['resolve_shanty', 'resolve_treasure', 'resolve_crew']);

/** Specialist agent-tool names — emit tool.called/tool.done SSE events for these. */
export const SPECIALIST_TOOLS = new Set(['shanty_specialist', 'treasure_specialist', 'crew_specialist']);

export type SpecialistMode = 'shanty' | 'treasure' | 'crew';

export interface SpecialistAgents {
  readonly shanty: Agent;
  readonly treasure: Agent;
  readonly crew: Agent;
}

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

function createKnowledgeTools(log: Logger) {
  const lookupShanty = tool({
    name: 'lookup_shanty_knowledge',
    description: 'Retrieve sample shanty references, motifs, and battle cues for the shanty specialist.',
    parameters: z.object({
      query: z.string().describe('What kind of shanty detail or motif is needed')
    }),
    execute: async ({ query }) => {
      const matches = lookupShantyKnowledge(query);
      log.info({ tool: 'lookup_shanty_knowledge', query, matches: matches.length }, 'Shanty knowledge lookup');
      return JSON.stringify({ items: matches });
    }
  });

  const lookupTreasure = tool({
    name: 'lookup_treasure_knowledge',
    description: 'Retrieve sample treasure lore, locations, and clues for the treasure specialist.',
    parameters: z.object({
      query: z.string().describe('What treasure clue, treasure name, or location detail is needed')
    }),
    execute: async ({ query }) => {
      const matches = lookupTreasureKnowledge(query);
      log.info({ tool: 'lookup_treasure_knowledge', query, matches: matches.length }, 'Treasure knowledge lookup');
      return JSON.stringify({ items: matches });
    }
  });

  const lookupCrew = tool({
    name: 'lookup_crew_knowledge',
    description: 'Retrieve sample ranks, shipboard roles, and qualifications for the crew specialist.',
    parameters: z.object({
      query: z.string().describe('What rank, role, or qualification detail is needed')
    }),
    execute: async ({ query }) => {
      const matches = lookupCrewKnowledge(query);
      log.info({ tool: 'lookup_crew_knowledge', query, matches: matches.length }, 'Crew knowledge lookup');
      return JSON.stringify({ items: matches });
    }
  });

  return { lookupShanty, lookupTreasure, lookupCrew };
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
 * Create the three specialist agents used by the sample.
 *
 * Each specialist is a user-facing conversational agent for a single mode.
 */
export function createSpecialistAgents(config: Config, log: Logger): SpecialistAgents {
  setTracingDisabled(true);

  const { resolveShanty, resolveTreasure, resolveCrew } = createResolutionTools(log);
  const { lookupShanty, lookupTreasure, lookupCrew } = createKnowledgeTools(log);

  const sharedInstructions = config.captainInstructions.trim();
  const compose = (specialistInstructions: string) => `${sharedInstructions}\n\n${specialistInstructions}`.trim();

  const shantyAgent = new Agent({
    name: 'Shanty',
    instructions: compose(config.shantyInstructions),
    model: config.model,
    modelSettings: {
      toolChoice: 'auto'
    },
    tools: [lookupShanty, resolveShanty]
  });

  const treasureAgent = new Agent({
    name: 'Treasure',
    instructions: compose(config.treasureInstructions),
    model: config.model,
    modelSettings: {
      toolChoice: 'auto'
    },
    tools: [lookupTreasure, resolveTreasure]
  });

  const crewAgent = new Agent({
    name: 'Crew',
    instructions: compose(config.crewInstructions),
    model: config.model,
    modelSettings: {
      toolChoice: 'auto'
    },
    tools: [lookupCrew, resolveCrew]
  });

  log.info({ model: config.model, agentName: config.agentName }, 'Agent hierarchy initialised');

  return {
    shanty: shantyAgent,
    treasure: treasureAgent,
    crew: crewAgent
  };
}

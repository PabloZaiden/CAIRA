/**
 * Agent setup — how to configure the OpenAI Agent SDK on Azure AI Foundry.
 *
 * This file is the "read this first" entry point for developers. It shows:
 *
 *   1. How to connect the SDK to Azure OpenAI via the runtime-appropriate Azure credential
 *   2. How to create agents with system instructions
 *   3. How to attach local knowledge tools and resolution tools to specialists
 *   4. How to pick a discrete specialist agent per conversation mode
 *
 * Architecture (discrete specialists):
 *
 *   Discovery agent    ─┬─ lookup_discovery_knowledge
 *                    └─ resolve_discovery
 *   Planning agent  ─┬─ lookup_planning_knowledge
 *                    └─ resolve_planning
 *   Staffing agent      ─┬─ lookup_staffing_knowledge
 *                    └─ resolve_staffing
 */

import { Agent, tool, setTracingDisabled, setDefaultOpenAIClient } from '@openai/agents';
import { AzureOpenAI } from 'openai';
import { getBearerTokenProvider } from '@azure/identity';
import { z } from 'zod';
import type { Config } from './config.ts';
import type { Logger } from './openai-client.ts';
import { createAzureCredential } from './azure-credential.ts';
import { lookupStaffingKnowledge, lookupDiscoveryKnowledge, lookupPlanningKnowledge } from './knowledge-base.ts';

// ---------------------------------------------------------------------------
// Resolution tool names (must match what prompts tell agents to call)
// ---------------------------------------------------------------------------

/** Resolution tool names — used to detect resolution from SDK output items. */
export const RESOLUTION_TOOLS = new Set(['resolve_discovery', 'resolve_planning', 'resolve_staffing']);

/** Specialist agent-tool names — emit tool.called/tool.done SSE events for these. */
export const SPECIALIST_TOOLS = new Set(['discovery_specialist', 'planning_specialist', 'staffing_specialist']);

export type SpecialistMode = 'discovery' | 'planning' | 'staffing';

export interface SpecialistAgents {
  readonly discovery: Agent;
  readonly planning: Agent;
  readonly staffing: Agent;
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
  const resolveDiscovery = tool({
    name: 'resolve_discovery',
    description:
      'Call this when the Opportunity Discovery Activity concludes. Records the qualification outcome and key signals.',
    parameters: z.object({
      fit: z.enum(['qualified', 'unqualified', 'follow_up']).describe('Qualification outcome for the opportunity'),
      signals_reviewed: z.number().describe('Number of qualification signals reviewed'),
      primary_need: z.string().describe('The most important customer need or buying signal')
    }),
    execute: async (input) => {
      log.info(
        { tool: 'resolve_discovery', result: input },
        `Discovery activity resolved: ${input.fit} after ${input.signals_reviewed} signals.`
      );
      return `Discovery activity resolved: ${input.fit} after ${input.signals_reviewed} signals.`;
    }
  });

  const resolvePlanning = tool({
    name: 'resolve_planning',
    description:
      'Call this when the Account Planning Activity concludes. Records whether the account plan should advance and the next step.',
    parameters: z.object({
      approved: z.boolean().describe('Whether the plan should advance now'),
      focus_area: z.string().describe('Name of the planning'),
      next_step: z.string().describe('The next milestone, meeting, or workstream')
    }),
    execute: async (input) => {
      log.info(
        { tool: 'resolve_planning', result: input },
        `Planning activity resolved: ${input.approved ? 'advance' : 'hold'} "${input.focus_area}" with next step ${input.next_step}.`
      );
      return `Planning activity resolved: ${input.approved ? 'advance' : 'hold'} "${input.focus_area}" with next step ${input.next_step}.`;
    }
  });

  const resolveStaffing = tool({
    name: 'resolve_staffing',
    description:
      'Call this when the staffing activity concludes. Records the recommended staffing coverage and owner role.',
    parameters: z.object({
      coverage_level: z.string().describe('The recommended coverage level'),
      role: z.string().describe('The recommended owner role'),
      team_name: z.string().describe('The fictional account team name')
    }),
    execute: async (input) => {
      log.info(
        { tool: 'resolve_staffing', result: input },
        `Staffing activity resolved: ${input.coverage_level} coverage with ${input.role} on ${input.team_name}.`
      );
      return `Staffing activity resolved: ${input.coverage_level} coverage with ${input.role} on ${input.team_name}.`;
    }
  });

  return { resolveDiscovery, resolvePlanning, resolveStaffing };
}

function createKnowledgeTools(log: Logger) {
  const lookupDiscovery = tool({
    name: 'lookup_discovery_knowledge',
    description: 'Retrieve sample discovery guidance and qualification cues for the discovery specialist.',
    parameters: z.object({
      query: z.string().describe('What discovery signal, qualification detail, or customer need is needed')
    }),
    execute: async ({ query }) => {
      const matches = lookupDiscoveryKnowledge(query);
      log.info({ tool: 'lookup_discovery_knowledge', query, matches: matches.length }, 'Discovery knowledge lookup');
      return JSON.stringify({ items: matches });
    }
  });

  const lookupPlanning = tool({
    name: 'lookup_planning_knowledge',
    description: 'Retrieve sample planning guidance, priorities, and milestones for the planning specialist.',
    parameters: z.object({
      query: z.string().describe('What planning focus area, risk, or next-step detail is needed')
    }),
    execute: async ({ query }) => {
      const matches = lookupPlanningKnowledge(query);
      log.info({ tool: 'lookup_planning_knowledge', query, matches: matches.length }, 'Planning knowledge lookup');
      return JSON.stringify({ items: matches });
    }
  });

  const lookupStaffing = tool({
    name: 'lookup_staffing_knowledge',
    description: 'Retrieve sample staffing roles, coverage guidance, and qualifications for the staffing specialist.',
    parameters: z.object({
      query: z.string().describe('What staffing role, coverage, or qualification detail is needed')
    }),
    execute: async ({ query }) => {
      const matches = lookupStaffingKnowledge(query);
      log.info({ tool: 'lookup_staffing_knowledge', query, matches: matches.length }, 'Staffing knowledge lookup');
      return JSON.stringify({ items: matches });
    }
  });

  return { lookupDiscovery, lookupPlanning, lookupStaffing };
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
 *   - HTTPS endpoint (production): uses the runtime-appropriate Azure credential for real
 *     Azure AD tokens via the cognitiveservices scope
 */
export async function setupAzureClient(config: Config): Promise<void> {
  const isHttpEndpoint = config.azureEndpoint.startsWith('http://');
  let tokenProvider: () => Promise<string>;

  if (isHttpEndpoint && config.skipAuth) {
    tokenProvider = () => Promise.resolve('dummy');
  } else {
    const credential = createAzureCredential();
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

  const { resolveDiscovery, resolvePlanning, resolveStaffing } = createResolutionTools(log);
  const { lookupDiscovery, lookupPlanning, lookupStaffing } = createKnowledgeTools(log);

  const sharedInstructions = config.sharedInstructions.trim();
  const compose = (specialistInstructions: string) => `${sharedInstructions}\n\n${specialistInstructions}`.trim();

  const discoveryAgent = new Agent({
    name: 'Discovery',
    instructions: compose(config.discoveryInstructions),
    model: config.model,
    modelSettings: {
      toolChoice: 'auto'
    },
    tools: [lookupDiscovery, resolveDiscovery]
  });

  const planningAgent = new Agent({
    name: 'Planning',
    instructions: compose(config.planningInstructions),
    model: config.model,
    modelSettings: {
      toolChoice: 'auto'
    },
    tools: [lookupPlanning, resolvePlanning]
  });

  const staffingAgent = new Agent({
    name: 'Staffing',
    instructions: compose(config.staffingInstructions),
    model: config.model,
    modelSettings: {
      toolChoice: 'auto'
    },
    tools: [lookupStaffing, resolveStaffing]
  });

  log.info({ model: config.model, agentName: config.agentName }, 'Agent hierarchy initialised');

  return {
    discovery: discoveryAgent,
    planning: planningAgent,
    staffing: staffingAgent
  };
}

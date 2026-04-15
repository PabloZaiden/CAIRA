/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ActivityClient, ActivityApiError } from '../../src/api/activity-client.ts';
import type {
  Adventure,
  AdventureList,
  AdventureDetail,
  AdventureStarted,
  ParleyMessage,
  ActivityStats
} from '../../src/types.ts';

// ---------- Test fixtures ----------

const BASE_URL = 'http://localhost:4000/api';

const ADVENTURE: Adventure = {
  id: 'adv-1',
  mode: 'discovery',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  lastParleyAt: '2026-01-02T00:00:00Z',
  messageCount: 3
};

const ADVENTURE_LIST: AdventureList = {
  adventures: [ADVENTURE],
  offset: 0,
  limit: 20,
  total: 1
};

const ADVENTURE_DETAIL: AdventureDetail = {
  ...ADVENTURE,
  parleys: [
    {
      id: 'msg-1',
      role: 'user',
      content: 'Hello!',
      createdAt: '2026-01-02T00:00:00Z'
    },
    {
      id: 'msg-2',
      role: 'assistant',
      content: 'Welcome to the workspace!',
      createdAt: '2026-01-02T00:00:01Z'
    }
  ]
};

const ADVENTURE_STARTED: AdventureStarted = {
  id: 'adv-new',
  mode: 'discovery',
  status: 'active',
  syntheticMessage:
    'I am qualifying a new customer opportunity. Lead a short discovery conversation, ask targeted questions, and conclude with a concise qualification summary.',
  createdAt: '2026-01-01T00:00:00Z'
};

const PARLEY_MESSAGE: ParleyMessage = {
  id: 'msg-3',
  role: 'assistant',
  content: 'Thanks for the update!',
  createdAt: '2026-01-02T00:01:00Z'
};

const STATS: ActivityStats = {
  totalAdventures: 10,
  activeAdventures: 7,
  resolvedAdventures: 3,
  byMode: {
    discovery: { total: 4, active: 3, resolved: 1 },
    planning: { total: 3, active: 2, resolved: 1 },
    staffing: { total: 3, active: 2, resolved: 1 }
  }
};

// ---------- Helpers ----------

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function errorResponse(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Create a ReadableStream that yields SSE text chunks.
 */
function sseStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
      }
      controller.close();
    }
  });
}

// ---------- Tests ----------

describe('ActivityClient', () => {
  let client: ActivityClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new ActivityClient({ baseUrl: BASE_URL });
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- startDiscovery ----

  describe('startDiscovery', () => {
    it('starts a discovery adventure', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse(ADVENTURE_STARTED, 200));

      const result = await client.startDiscovery();
      expect(result).toEqual(ADVENTURE_STARTED);
      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE_URL}/activities/discovery`,
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('throws ActivityApiError on server error', async () => {
      fetchSpy.mockResolvedValueOnce(errorResponse(500, 'agent_error', 'Something went wrong'));

      const err = await client.startDiscovery().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ActivityApiError);
      expect(err).toMatchObject({ status: 500, code: 'agent_error' });
    });
  });

  // ---- startPlanning ----

  describe('startPlanning', () => {
    it('starts a planning adventure', async () => {
      const started: AdventureStarted = { ...ADVENTURE_STARTED, mode: 'planning' };
      fetchSpy.mockResolvedValueOnce(jsonResponse(started, 200));

      const result = await client.startPlanning();
      expect(result).toEqual(started);
      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE_URL}/activities/planning`,
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  // ---- startStaffing ----

  describe('startStaffing', () => {
    it('starts a staffing adventure', async () => {
      const started: AdventureStarted = { ...ADVENTURE_STARTED, mode: 'staffing' };
      fetchSpy.mockResolvedValueOnce(jsonResponse(started, 200));

      const result = await client.startStaffing();
      expect(result).toEqual(started);
      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE_URL}/activities/staffing`,
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  // ---- listAdventures ----

  describe('listAdventures', () => {
    it('lists adventures with default params', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse(ADVENTURE_LIST));

      const result = await client.listAdventures();
      expect(result).toEqual(ADVENTURE_LIST);
      expect(fetchSpy).toHaveBeenCalledWith(`${BASE_URL}/activities/adventures`);
    });

    it('lists adventures with offset and limit', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse(ADVENTURE_LIST));

      await client.listAdventures(10, 5);
      expect(fetchSpy).toHaveBeenCalledWith(`${BASE_URL}/activities/adventures?offset=10&limit=5`);
    });
  });

  // ---- getAdventure ----

  describe('getAdventure', () => {
    it('gets adventure detail', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse(ADVENTURE_DETAIL));

      const result = await client.getAdventure('adv-1');
      expect(result).toEqual(ADVENTURE_DETAIL);
      expect(fetchSpy).toHaveBeenCalledWith(`${BASE_URL}/activities/adventures/adv-1`);
    });

    it('throws on 404', async () => {
      fetchSpy.mockResolvedValueOnce(errorResponse(404, 'not_found', 'Adventure not found'));

      await expect(client.getAdventure('unknown')).rejects.toThrow(ActivityApiError);
    });
  });

  // ---- parley (JSON) ----

  describe('parley', () => {
    it('sends a message and gets JSON response', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse(PARLEY_MESSAGE));

      const result = await client.parley('adv-1', 'Hello!');
      expect(result).toEqual(PARLEY_MESSAGE);
      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE_URL}/activities/adventures/adv-1/parley`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ message: 'Hello!' })
        })
      );
    });
  });

  // ---- parleyStream (SSE) ----

  describe('parleyStream', () => {
    it('streams SSE events', async () => {
      const stream = sseStream([
        'event: message.delta\ndata: {"content":"Welcome "}\n\n',
        'event: message.delta\ndata: {"content":"back!"}\n\n',
        'event: message.complete\ndata: {"messageId":"msg-4","content":"Welcome back!","usage":{"promptTokens":10,"completionTokens":8}}\n\n'
      ]);

      fetchSpy.mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' }
        })
      );

      const events: unknown[] = [];
      for await (const event of client.parleyStream('adv-1', 'Hello!')) {
        events.push(event);
      }

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: 'delta', content: 'Welcome ' });
      expect(events[1]).toEqual({ type: 'delta', content: 'back!' });
      expect(events[2]).toMatchObject({
        type: 'complete',
        message: expect.objectContaining({
          id: 'msg-4',
          content: 'Welcome back!',
          role: 'assistant'
        })
      });
    });

    it('handles activity.resolved SSE events', async () => {
      const stream = sseStream([
        'event: message.delta\ndata: {"content":"You win!"}\n\n',
        'event: activity.resolved\ndata: {"tool":"resolve_discovery","result":{"winner":"user","rounds":4,"primary_need":"Through storms we sail"}}\n\n',
        'event: message.complete\ndata: {"messageId":"msg-5","content":"You win!","usage":{"promptTokens":10,"completionTokens":5}}\n\n'
      ]);

      fetchSpy.mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' }
        })
      );

      const events: unknown[] = [];
      for await (const event of client.parleyStream('adv-1', 'My verse')) {
        events.push(event);
      }

      expect(events).toHaveLength(3);
      expect(events[1]).toEqual({
        type: 'activity.resolved',
        outcome: {
          tool: 'resolve_discovery',
          result: { winner: 'user', rounds: 4, primary_need: 'Through storms we sail' }
        }
      });
    });

    it('handles tool.called and tool.done SSE events', async () => {
      const stream = sseStream([
        'event: tool.called\ndata: {"toolName":"discovery_specialist"}\n\n',
        'event: message.delta\ndata: {"content":"Singing..."}\n\n',
        'event: tool.done\ndata: {"toolName":"discovery_specialist"}\n\n',
        'event: message.complete\ndata: {"messageId":"msg-6","content":"Singing...","usage":{"promptTokens":10,"completionTokens":5}}\n\n'
      ]);

      fetchSpy.mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' }
        })
      );

      const events: unknown[] = [];
      for await (const event of client.parleyStream('adv-1', 'Sing!')) {
        events.push(event);
      }

      expect(events).toHaveLength(4);
      expect(events[0]).toEqual({ type: 'tool.called', toolName: 'discovery_specialist' });
      expect(events[2]).toEqual({ type: 'tool.done', toolName: 'discovery_specialist' });
    });

    it('handles SSE error events', async () => {
      const stream = sseStream([
        'event: error\ndata: {"code":"agent_error","message":"The service is temporarily unavailable today"}\n\n'
      ]);

      fetchSpy.mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' }
        })
      );

      const events: unknown[] = [];
      for await (const event of client.parleyStream('adv-1', 'Hello!')) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'error',
        code: 'agent_error',
        message: 'The service is temporarily unavailable today'
      });
    });

    it('throws on HTTP error response', async () => {
      fetchSpy.mockResolvedValueOnce(errorResponse(500, 'agent_error', 'Server error'));

      const gen = client.parleyStream('adv-1', 'Hello!');
      await expect(gen.next()).rejects.toThrow(ActivityApiError);
    });

    it('throws on missing response body', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));

      const gen = client.parleyStream('adv-1', 'Hello!');
      await expect(gen.next()).rejects.toThrow(ActivityApiError);
    });

    it('sends Accept: text/event-stream header', async () => {
      const stream = sseStream([]);
      fetchSpy.mockResolvedValueOnce(new Response(stream, { status: 200 }));

      const events: unknown[] = [];
      for await (const event of client.parleyStream('adv-1', 'Hello!')) {
        events.push(event);
      }

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE_URL}/activities/adventures/adv-1/parley`,
        expect.objectContaining({
          headers: expect.objectContaining({
            Accept: 'text/event-stream'
          })
        })
      );
    });
  });

  // ---- getStats ----

  describe('getStats', () => {
    it('gets activity statistics', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse(STATS));

      const result = await client.getStats();
      expect(result).toEqual(STATS);
      expect(fetchSpy).toHaveBeenCalledWith(`${BASE_URL}/activities/stats`);
    });
  });

  // ---- getHealth ----

  describe('getHealth', () => {
    it('gets health status', async () => {
      const health = { status: 'healthy', dependencies: [] };
      fetchSpy.mockResolvedValueOnce(jsonResponse(health));

      const result = await client.getHealth();
      expect(result).toEqual(health);
      // /api is stripped, health is at root
      expect(fetchSpy).toHaveBeenCalledWith('http://localhost:4000/health');
    });
  });

  // ---- Error handling ----

  describe('error handling', () => {
    it('handles non-JSON error responses', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }));

      const err = await client.startDiscovery().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ActivityApiError);
      expect(err).toMatchObject({ status: 500, code: 'http_500' });
    });

    it('strips trailing slashes from baseUrl', () => {
      const c = new ActivityClient({ baseUrl: 'http://example.com/api///' });
      fetchSpy.mockResolvedValueOnce(jsonResponse(ADVENTURE_LIST));
      void c.listAdventures();
      expect(fetchSpy).toHaveBeenCalledWith('http://example.com/api/activities/adventures');
    });
  });
});

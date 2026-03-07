/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PirateClient, PirateApiError } from '../../src/api/pirate-client.ts';
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
  mode: 'shanty',
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
      content: 'Ahoy!',
      createdAt: '2026-01-02T00:00:00Z'
    },
    {
      id: 'msg-2',
      role: 'assistant',
      content: 'Arr, welcome aboard!',
      createdAt: '2026-01-02T00:00:01Z'
    }
  ]
};

const ADVENTURE_STARTED: AdventureStarted = {
  id: 'adv-new',
  mode: 'shanty',
  status: 'active',
  syntheticMessage: 'Sing me a sea shanty and challenge me to a verse duel!',
  createdAt: '2026-01-01T00:00:00Z'
};

const PARLEY_MESSAGE: ParleyMessage = {
  id: 'msg-3',
  role: 'assistant',
  content: 'Shiver me timbers!',
  createdAt: '2026-01-02T00:01:00Z'
};

const STATS: ActivityStats = {
  totalAdventures: 10,
  activeAdventures: 7,
  resolvedAdventures: 3,
  byMode: {
    shanty: { total: 4, active: 3, resolved: 1 },
    treasure: { total: 3, active: 2, resolved: 1 },
    crew: { total: 3, active: 2, resolved: 1 }
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

describe('PirateClient', () => {
  let client: PirateClient;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new PirateClient({ baseUrl: BASE_URL });
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as any;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- startShanty ----

  describe('startShanty', () => {
    it('starts a shanty adventure', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse(ADVENTURE_STARTED, 200));

      const result = await client.startShanty();
      expect(result).toEqual(ADVENTURE_STARTED);
      expect(fetchSpy).toHaveBeenCalledWith(`${BASE_URL}/pirate/shanty`, expect.objectContaining({ method: 'POST' }));
    });

    it('throws PirateApiError on server error', async () => {
      fetchSpy.mockResolvedValueOnce(errorResponse(500, 'agent_error', 'Something went wrong'));

      const err = await client.startShanty().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PirateApiError);
      expect(err).toMatchObject({ status: 500, code: 'agent_error' });
    });
  });

  // ---- seekTreasure ----

  describe('seekTreasure', () => {
    it('starts a treasure adventure', async () => {
      const started: AdventureStarted = { ...ADVENTURE_STARTED, mode: 'treasure' };
      fetchSpy.mockResolvedValueOnce(jsonResponse(started, 200));

      const result = await client.seekTreasure();
      expect(result).toEqual(started);
      expect(fetchSpy).toHaveBeenCalledWith(`${BASE_URL}/pirate/treasure`, expect.objectContaining({ method: 'POST' }));
    });
  });

  // ---- enlistInCrew ----

  describe('enlistInCrew', () => {
    it('starts a crew adventure', async () => {
      const started: AdventureStarted = { ...ADVENTURE_STARTED, mode: 'crew' };
      fetchSpy.mockResolvedValueOnce(jsonResponse(started, 200));

      const result = await client.enlistInCrew();
      expect(result).toEqual(started);
      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE_URL}/pirate/crew/enlist`,
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
      expect(fetchSpy).toHaveBeenCalledWith(`${BASE_URL}/pirate/adventures`);
    });

    it('lists adventures with offset and limit', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse(ADVENTURE_LIST));

      await client.listAdventures(10, 5);
      expect(fetchSpy).toHaveBeenCalledWith(`${BASE_URL}/pirate/adventures?offset=10&limit=5`);
    });
  });

  // ---- getAdventure ----

  describe('getAdventure', () => {
    it('gets adventure detail', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse(ADVENTURE_DETAIL));

      const result = await client.getAdventure('adv-1');
      expect(result).toEqual(ADVENTURE_DETAIL);
      expect(fetchSpy).toHaveBeenCalledWith(`${BASE_URL}/pirate/adventures/adv-1`);
    });

    it('throws on 404', async () => {
      fetchSpy.mockResolvedValueOnce(errorResponse(404, 'not_found', 'Adventure not found'));

      await expect(client.getAdventure('unknown')).rejects.toThrow(PirateApiError);
    });
  });

  // ---- parley (JSON) ----

  describe('parley', () => {
    it('sends a message and gets JSON response', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse(PARLEY_MESSAGE));

      const result = await client.parley('adv-1', 'Ahoy!');
      expect(result).toEqual(PARLEY_MESSAGE);
      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE_URL}/pirate/adventures/adv-1/parley`,
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ message: 'Ahoy!' })
        })
      );
    });
  });

  // ---- parleyStream (SSE) ----

  describe('parleyStream', () => {
    it('streams SSE events', async () => {
      const stream = sseStream([
        'event: message.delta\ndata: {"content":"Arr, "}\n\n',
        'event: message.delta\ndata: {"content":"welcome "}\n\n',
        'event: message.complete\ndata: {"messageId":"msg-4","content":"Arr, welcome aboard!","usage":{"promptTokens":10,"completionTokens":8}}\n\n'
      ]);

      fetchSpy.mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' }
        })
      );

      const events: unknown[] = [];
      for await (const event of client.parleyStream('adv-1', 'Ahoy!')) {
        events.push(event);
      }

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: 'delta', content: 'Arr, ' });
      expect(events[1]).toEqual({ type: 'delta', content: 'welcome ' });
      expect(events[2]).toMatchObject({
        type: 'complete',
        message: expect.objectContaining({
          id: 'msg-4',
          content: 'Arr, welcome aboard!',
          role: 'assistant'
        })
      });
    });

    it('handles activity.resolved SSE events', async () => {
      const stream = sseStream([
        'event: message.delta\ndata: {"content":"You win!"}\n\n',
        'event: activity.resolved\ndata: {"tool":"resolve_shanty","result":{"winner":"user","rounds":4,"best_verse":"Through storms we sail"}}\n\n',
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
          tool: 'resolve_shanty',
          result: { winner: 'user', rounds: 4, best_verse: 'Through storms we sail' }
        }
      });
    });

    it('handles tool.called and tool.done SSE events', async () => {
      const stream = sseStream([
        'event: tool.called\ndata: {"toolName":"shanty_specialist"}\n\n',
        'event: message.delta\ndata: {"content":"Singing..."}\n\n',
        'event: tool.done\ndata: {"toolName":"shanty_specialist"}\n\n',
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
      expect(events[0]).toEqual({ type: 'tool.called', toolName: 'shanty_specialist' });
      expect(events[2]).toEqual({ type: 'tool.done', toolName: 'shanty_specialist' });
    });

    it('handles SSE error events', async () => {
      const stream = sseStream(['event: error\ndata: {"code":"agent_error","message":"The seas be rough today"}\n\n']);

      fetchSpy.mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' }
        })
      );

      const events: unknown[] = [];
      for await (const event of client.parleyStream('adv-1', 'Ahoy!')) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'error',
        code: 'agent_error',
        message: 'The seas be rough today'
      });
    });

    it('throws on HTTP error response', async () => {
      fetchSpy.mockResolvedValueOnce(errorResponse(500, 'agent_error', 'Server error'));

      const gen = client.parleyStream('adv-1', 'Ahoy!');
      await expect(gen.next()).rejects.toThrow(PirateApiError);
    });

    it('throws on missing response body', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));

      const gen = client.parleyStream('adv-1', 'Ahoy!');
      await expect(gen.next()).rejects.toThrow(PirateApiError);
    });

    it('sends Accept: text/event-stream header', async () => {
      const stream = sseStream([]);
      fetchSpy.mockResolvedValueOnce(new Response(stream, { status: 200 }));

      const events: unknown[] = [];
      for await (const event of client.parleyStream('adv-1', 'Ahoy!')) {
        events.push(event);
      }

      expect(fetchSpy).toHaveBeenCalledWith(
        `${BASE_URL}/pirate/adventures/adv-1/parley`,
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
      expect(fetchSpy).toHaveBeenCalledWith(`${BASE_URL}/pirate/stats`);
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

      const err = await client.startShanty().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PirateApiError);
      expect(err).toMatchObject({ status: 500, code: 'http_500' });
    });

    it('strips trailing slashes from baseUrl', () => {
      const c = new PirateClient({ baseUrl: 'http://example.com/api///' });
      fetchSpy.mockResolvedValueOnce(jsonResponse(ADVENTURE_LIST));
      void c.listAdventures();
      expect(fetchSpy).toHaveBeenCalledWith('http://example.com/api/pirate/adventures');
    });
  });
});

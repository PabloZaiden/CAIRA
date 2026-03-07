/**
 * Unit tests for the schema validator.
 *
 * Tests validation of JSON objects against named OpenAPI component schemas
 * from the backend-api.openapi.yaml spec.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { validateSchema, resetSchemaCache } from '../src/helpers/schema-validator.ts';
import { SCHEMAS } from '../src/fixtures/pirate-fixtures.ts';

afterEach(() => {
  resetSchemaCache();
});

describe('validateSchema', () => {
  // ─── Valid objects ──────────────────────────────────────────────────

  describe('valid objects', () => {
    it('validates a valid Adventure', async () => {
      const result = await validateSchema(SCHEMAS.Adventure, {
        id: 'adv_001',
        mode: 'shanty',
        status: 'active',
        createdAt: '2026-01-15T10:30:00.000Z',
        lastParleyAt: '2026-01-15T10:30:00.000Z',
        messageCount: 0
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('validates an Adventure with optional outcome', async () => {
      const result = await validateSchema(SCHEMAS.Adventure, {
        id: 'adv_002',
        mode: 'treasure',
        status: 'resolved',
        outcome: {
          tool: 'resolve_treasure',
          result: { found: true, treasure_name: 'Golden Chalice', location: 'Skeleton Cove' }
        },
        createdAt: '2026-01-15T10:30:00.000Z',
        lastParleyAt: '2026-01-15T11:00:00.000Z',
        messageCount: 5
      });

      expect(result.valid).toBe(true);
    });

    it('validates a valid AdventureStarted', async () => {
      const result = await validateSchema(SCHEMAS.AdventureStarted, {
        id: 'adv_003',
        mode: 'crew',
        status: 'active',
        syntheticMessage:
          'I want to join your pirate crew! Interview me and assign me a rank and role aboard your ship.',
        createdAt: '2026-01-15T10:30:00.000Z'
      });

      expect(result.valid).toBe(true);
    });

    it('validates a valid AdventureDetail', async () => {
      const result = await validateSchema(SCHEMAS.AdventureDetail, {
        id: 'adv_004',
        mode: 'shanty',
        status: 'resolved',
        outcome: {
          tool: 'resolve_shanty',
          result: { winner: 'user', rounds: 4, best_verse: 'Through storms...' }
        },
        createdAt: '2026-01-15T10:30:00.000Z',
        lastParleyAt: '2026-01-15T10:35:00.000Z',
        messageCount: 2,
        parleys: [
          {
            id: 'msg_1',
            role: 'user',
            content: 'Ahoy!',
            createdAt: '2026-01-15T10:30:00.000Z'
          },
          {
            id: 'msg_2',
            role: 'assistant',
            content: 'Arr!',
            createdAt: '2026-01-15T10:31:00.000Z',
            usage: { promptTokens: 5, completionTokens: 1 }
          }
        ]
      });

      expect(result.valid).toBe(true);
    });

    it('validates a valid AdventureList', async () => {
      const result = await validateSchema(SCHEMAS.AdventureList, {
        adventures: [
          {
            id: 'adv_001',
            mode: 'shanty',
            status: 'active',
            createdAt: '2026-01-15T10:30:00.000Z',
            lastParleyAt: '2026-01-15T10:30:00.000Z',
            messageCount: 0
          }
        ],
        offset: 0,
        limit: 20,
        total: 1
      });

      expect(result.valid).toBe(true);
    });

    it('validates a valid ParleyMessage', async () => {
      const result = await validateSchema(SCHEMAS.ParleyMessage, {
        id: 'msg_123',
        role: 'assistant',
        content: 'Arr, welcome aboard matey!',
        createdAt: '2026-01-15T10:30:00.000Z',
        usage: { promptTokens: 10, completionTokens: 8 }
      });

      expect(result.valid).toBe(true);
    });

    it('validates a ParleyMessage with optional resolution', async () => {
      const result = await validateSchema(SCHEMAS.ParleyMessage, {
        id: 'msg_456',
        role: 'assistant',
        content: 'Ye won the shanty battle!',
        createdAt: '2026-01-15T10:30:00.000Z',
        usage: { promptTokens: 10, completionTokens: 8 },
        resolution: {
          tool: 'resolve_shanty',
          result: { winner: 'user', rounds: 4, best_verse: 'Through storms...' }
        }
      });

      expect(result.valid).toBe(true);
    });

    it('validates a valid ActivityStats', async () => {
      const result = await validateSchema(SCHEMAS.ActivityStats, {
        totalAdventures: 42,
        activeAdventures: 7,
        resolvedAdventures: 35,
        byMode: {
          shanty: { total: 15, active: 3, resolved: 12 },
          treasure: { total: 20, active: 2, resolved: 18 },
          crew: { total: 7, active: 2, resolved: 5 }
        }
      });

      expect(result.valid).toBe(true);
    });

    it('validates a valid ModeStats', async () => {
      const result = await validateSchema(SCHEMAS.ModeStats, {
        total: 15,
        active: 3,
        resolved: 12
      });

      expect(result.valid).toBe(true);
    });

    it('validates a valid HealthResponse', async () => {
      const result = await validateSchema(SCHEMAS.HealthResponse, {
        status: 'healthy',
        dependencies: [{ name: 'agent-container', status: 'healthy', latencyMs: 12 }]
      });

      expect(result.valid).toBe(true);
    });

    it('validates a valid ErrorResponse', async () => {
      const result = await validateSchema(SCHEMAS.ErrorResponse, {
        code: 'not_found',
        message: 'Adventure not found'
      });

      expect(result.valid).toBe(true);
    });
  });

  // ─── Invalid objects ────────────────────────────────────────────────

  describe('invalid objects', () => {
    it('rejects an Adventure missing required fields', async () => {
      const result = await validateSchema(SCHEMAS.Adventure, {
        id: 'adv_001'
        // missing mode, status, createdAt, lastParleyAt, messageCount
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('rejects an Adventure with invalid mode enum', async () => {
      const result = await validateSchema(SCHEMAS.Adventure, {
        id: 'adv_001',
        mode: 'duel', // not in enum: [shanty, treasure, crew]
        status: 'active',
        createdAt: '2026-01-15T10:30:00.000Z',
        lastParleyAt: '2026-01-15T10:30:00.000Z',
        messageCount: 0
      });

      expect(result.valid).toBe(false);
    });

    it('rejects an Adventure with invalid status enum', async () => {
      const result = await validateSchema(SCHEMAS.Adventure, {
        id: 'adv_001',
        mode: 'shanty',
        status: 'finished', // not in enum: [active, resolved]
        createdAt: '2026-01-15T10:30:00.000Z',
        lastParleyAt: '2026-01-15T10:30:00.000Z',
        messageCount: 0
      });

      expect(result.valid).toBe(false);
    });

    it('rejects a ParleyMessage with invalid role', async () => {
      const result = await validateSchema(SCHEMAS.ParleyMessage, {
        id: 'msg_123',
        role: 'pirate', // Not in enum: [user, assistant, system]
        content: 'Arr!',
        createdAt: '2026-01-15T10:30:00.000Z'
      });

      expect(result.valid).toBe(false);
    });

    it('rejects an empty object as HealthResponse', async () => {
      const result = await validateSchema(SCHEMAS.HealthResponse, {});

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('status'))).toBe(true);
    });

    it('rejects HealthResponse with invalid status enum', async () => {
      const result = await validateSchema(SCHEMAS.HealthResponse, {
        status: 'unknown'
      });

      expect(result.valid).toBe(false);
    });

    it('rejects ActivityStats missing byMode', async () => {
      const result = await validateSchema(SCHEMAS.ActivityStats, {
        totalAdventures: 10,
        activeAdventures: 5,
        resolvedAdventures: 5
        // missing byMode
      });

      expect(result.valid).toBe(false);
    });

    it('rejects AdventureOutcome missing tool field', async () => {
      const result = await validateSchema(SCHEMAS.AdventureOutcome, {
        result: { winner: 'user' }
        // missing tool
      });

      expect(result.valid).toBe(false);
    });
  });

  // ─── Edge cases ─────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns error for non-existent schema name', async () => {
      const result = await validateSchema('NonExistentSchema', {});

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not found');
    });

    it('validates an empty adventure list', async () => {
      const result = await validateSchema(SCHEMAS.AdventureList, {
        adventures: [],
        offset: 0,
        limit: 20,
        total: 0
      });

      expect(result.valid).toBe(true);
    });

    it('validates ParleyMessage without optional usage', async () => {
      const result = await validateSchema(SCHEMAS.ParleyMessage, {
        id: 'msg_123',
        role: 'user',
        content: 'Hello!',
        createdAt: '2026-01-15T10:30:00.000Z'
      });

      expect(result.valid).toBe(true);
    });

    it('validates AdventureDetail without optional outcome', async () => {
      const result = await validateSchema(SCHEMAS.AdventureDetail, {
        id: 'adv_005',
        mode: 'treasure',
        status: 'active',
        createdAt: '2026-01-15T10:30:00.000Z',
        lastParleyAt: '2026-01-15T10:30:00.000Z',
        messageCount: 1,
        parleys: [
          {
            id: 'msg_1',
            role: 'user',
            content: 'Where be the treasure?',
            createdAt: '2026-01-15T10:30:00.000Z'
          }
        ]
      });

      expect(result.valid).toBe(true);
    });
  });
});

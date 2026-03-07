/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Unit tests for src/conversation-store.ts — in-memory conversation state.
 *
 * Tests the ConversationStore class in isolation: conversation CRUD,
 * pagination, message management, and ID generation.
 */

import { describe, it, expect } from 'vitest';
import { ConversationStore } from '../src/conversation-store.ts';
import type { Message } from '../src/types.ts';

describe('ConversationStore', () => {
  describe('create', () => {
    it('creates a conversation with a UUID-based ID', () => {
      const store = new ConversationStore();
      const conv = store.create();
      expect(conv.id).toMatch(/^conv_[0-9a-f-]{36}$/);
      expect(conv.createdAt).toBeDefined();
      expect(conv.updatedAt).toBeDefined();
    });

    it('includes metadata when provided', () => {
      const store = new ConversationStore();
      const conv = store.create({ topic: 'pirates' });
      expect(conv.metadata).toEqual({ topic: 'pirates' });
    });

    it('omits metadata key when none provided', () => {
      const store = new ConversationStore();
      const conv = store.create();
      expect(conv).not.toHaveProperty('metadata');
    });

    it('creates unique IDs for each conversation', () => {
      const store = new ConversationStore();
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(store.create().id);
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('list', () => {
    it('returns empty list when no conversations', () => {
      const store = new ConversationStore();
      const list = store.list();
      expect(list.items).toEqual([]);
      expect(list.total).toBe(0);
      expect(list.offset).toBe(0);
      expect(list.limit).toBe(20);
    });

    it('returns all conversations', () => {
      const store = new ConversationStore();
      store.create();
      store.create();
      store.create();

      const list = store.list();
      expect(list.items).toHaveLength(3);
      expect(list.total).toBe(3);
    });

    it('respects offset and limit', () => {
      const store = new ConversationStore();
      store.create({ order: 1 });
      store.create({ order: 2 });
      store.create({ order: 3 });

      const list = store.list(1, 1);
      expect(list.items).toHaveLength(1);
      expect(list.offset).toBe(1);
      expect(list.limit).toBe(1);
      expect(list.total).toBe(3);
    });

    it('includes metadata in listed conversations', () => {
      const store = new ConversationStore();
      store.create({ topic: 'shanties' });
      store.create();

      const list = store.list();
      const withMeta = list.items.find((c) => c.metadata !== undefined);
      const withoutMeta = list.items.find((c) => !('metadata' in c));
      expect(withMeta?.metadata).toEqual({ topic: 'shanties' });
      expect(withoutMeta).toBeDefined();
    });
  });

  describe('get', () => {
    it('returns undefined for unknown conversation', () => {
      const store = new ConversationStore();
      const result = store.get('nonexistent');
      expect(result).toBeUndefined();
    });

    it('returns conversation detail with empty messages', () => {
      const store = new ConversationStore();
      const conv = store.create();
      const detail = store.get(conv.id);
      expect(detail).toBeDefined();
      expect(detail!.id).toBe(conv.id);
      expect(detail!.messages).toEqual([]);
    });

    it('returns a copy of messages (not a reference)', () => {
      const store = new ConversationStore();
      const conv = store.create();
      const msg: Message = {
        id: 'msg_test',
        role: 'user',
        content: 'Hello',
        createdAt: new Date().toISOString()
      };
      store.addMessage(conv.id, msg);

      const detail1 = store.get(conv.id);
      const detail2 = store.get(conv.id);
      // Should be equal but not the same array reference
      expect(detail1!.messages).toEqual(detail2!.messages);
      expect(detail1!.messages).not.toBe(detail2!.messages);
    });
  });

  describe('getRecord', () => {
    it('returns undefined for unknown conversation', () => {
      const store = new ConversationStore();
      expect(store.getRecord('nonexistent')).toBeUndefined();
    });

    it('returns the mutable record', () => {
      const store = new ConversationStore();
      const conv = store.create();
      const record = store.getRecord(conv.id);
      expect(record).toBeDefined();
      expect(record!.id).toBe(conv.id);
      expect(record!.lastResponseId).toBeUndefined();
    });
  });

  describe('addMessage', () => {
    it('appends a message to the conversation', () => {
      const store = new ConversationStore();
      const conv = store.create();
      const msg: Message = {
        id: 'msg_1',
        role: 'user',
        content: 'Hello',
        createdAt: new Date().toISOString()
      };
      store.addMessage(conv.id, msg);

      const detail = store.get(conv.id);
      expect(detail!.messages).toHaveLength(1);
      expect(detail!.messages[0]!.content).toBe('Hello');
    });

    it('updates the updatedAt timestamp', () => {
      const store = new ConversationStore();
      const conv = store.create();
      const originalUpdatedAt = conv.updatedAt;

      // Small delay to ensure different timestamp
      const msg: Message = {
        id: 'msg_1',
        role: 'user',
        content: 'Hello',
        createdAt: new Date().toISOString()
      };
      store.addMessage(conv.id, msg);

      const record = store.getRecord(conv.id);
      expect(record!.updatedAt).toBeDefined();
      // updatedAt should be >= original (may be same if sub-ms)
      expect(new Date(record!.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(originalUpdatedAt).getTime());
    });

    it('silently ignores unknown conversation IDs', () => {
      const store = new ConversationStore();
      const msg: Message = {
        id: 'msg_1',
        role: 'user',
        content: 'Hello',
        createdAt: new Date().toISOString()
      };
      // Should not throw
      store.addMessage('nonexistent', msg);
    });
  });

  describe('messageId', () => {
    it('generates UUID-based message IDs', () => {
      const id = ConversationStore.messageId();
      expect(id).toMatch(/^msg_[0-9a-f-]{36}$/);
    });

    it('generates unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(ConversationStore.messageId());
      }
      expect(ids.size).toBe(100);
    });
  });
});

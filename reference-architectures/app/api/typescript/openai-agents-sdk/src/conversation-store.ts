/**
 * In-memory conversation state management.
 *
 * Owns the client-side conversation records that the OpenAI Responses API
 * requires (the API is stateless — continuity is maintained via
 * `previousResponseId` chaining, but we still need to track messages and
 * metadata for the agent-api contract).
 *
 * Separated from the SDK wrapper so that:
 *   - Conversation CRUD is testable in isolation
 *   - The SDK wrapper focuses purely on agent orchestration
 *   - A developer reading the sample can understand state management
 *     without wading through SDK call logic
 */

import { randomUUID } from 'node:crypto';
import type { Conversation, ConversationDetail, ConversationList, Message } from './types.ts';

// ---------------------------------------------------------------------------
// Internal record — mutable fields for conversation chaining
// ---------------------------------------------------------------------------

export interface ConversationRecord {
  readonly id: string;
  readonly metadata: Record<string, unknown> | undefined;
  readonly createdAt: string;
  updatedAt: string;
  /** The last response ID for conversation chaining (Responses API) */
  lastResponseId: string | undefined;
  /** Accumulated messages for this conversation */
  readonly messages: Message[];
}

// ---------------------------------------------------------------------------
// ConversationStore
// ---------------------------------------------------------------------------

export class ConversationStore {
  private readonly conversations = new Map<string, ConversationRecord>();

  /** Create a new conversation and return the public representation. */
  create(metadata?: Record<string, unknown> | undefined): Conversation {
    const id = `conv_${randomUUID()}`;
    const now = new Date().toISOString();

    const record: ConversationRecord = {
      id,
      metadata,
      createdAt: now,
      updatedAt: now,
      lastResponseId: undefined,
      messages: []
    };
    this.conversations.set(id, record);

    return {
      id,
      createdAt: now,
      updatedAt: now,
      ...(metadata ? { metadata } : {})
    };
  }

  /** List conversations with pagination, sorted by most recently updated. */
  list(offset = 0, limit = 20): ConversationList {
    const all = Array.from(this.conversations.values());
    all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const page = all.slice(offset, offset + limit);
    return {
      items: page.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        ...(r.metadata ? { metadata: r.metadata } : {})
      })),
      offset,
      limit,
      total: all.length
    };
  }

  /** Get a conversation's full detail (including messages). */
  get(conversationId: string): ConversationDetail | undefined {
    const record = this.conversations.get(conversationId);
    if (!record) return undefined;

    return {
      id: record.id,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      ...(record.metadata ? { metadata: record.metadata } : {}),
      messages: [...record.messages]
    };
  }

  /**
   * Get the mutable internal record for a conversation.
   * Used by the SDK wrapper to update `lastResponseId` and append messages.
   */
  getRecord(conversationId: string): ConversationRecord | undefined {
    return this.conversations.get(conversationId);
  }

  /** Append a message to a conversation's message list. */
  addMessage(conversationId: string, message: Message): void {
    const record = this.conversations.get(conversationId);
    if (!record) return;
    record.messages.push(message);
    record.updatedAt = new Date().toISOString();
  }

  /** Generate a unique message ID. */
  static messageId(): string {
    return `msg_${randomUUID()}`;
  }
}

/**
 * Typed HTTP client for the CAIRA backend API (pirate theme).
 *
 * Maps to the endpoints defined in contracts/backend-api.openapi.yaml v2.0.0.
 * Provides typed request/response methods for each operation.
 *
 * Multi-agent endpoints:
 *   POST /api/pirate/shanty          — start a sea shanty battle
 *   POST /api/pirate/treasure        — start a treasure hunt
 *   POST /api/pirate/crew/enlist     — enlist in pirate crew
 *   GET  /api/pirate/adventures      — list all adventures
 *   GET  /api/pirate/adventures/:id  — get adventure detail
 *   POST /api/pirate/adventures/:id/parley — continue chatting
 *   GET  /api/pirate/stats           — activity stats
 *   GET  /health                     — health check
 */

// ─── Response types (matching OpenAPI schemas) ──────────────────────────

export type AdventureMode = 'shanty' | 'treasure' | 'crew';
export type AdventureStatus = 'active' | 'resolved';

export interface AdventureOutcome {
  tool: string;
  result: Record<string, unknown>;
}

export interface Adventure {
  id: string;
  mode: AdventureMode;
  status: AdventureStatus;
  outcome?: AdventureOutcome | undefined;
  createdAt: string;
  lastParleyAt: string;
  messageCount: number;
}

export interface AdventureStarted {
  id: string;
  mode: AdventureMode;
  status: AdventureStatus;
  syntheticMessage: string;
  createdAt: string;
}

export interface AdventureDetail extends Adventure {
  parleys: ParleyMessage[];
}

export interface AdventureList {
  adventures: Adventure[];
  offset: number;
  limit: number;
  total: number;
}

export interface ParleyMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  usage?: TokenUsage | undefined;
  resolution?: AdventureOutcome | undefined;
}

export interface TokenUsage {
  promptTokens?: number | undefined;
  completionTokens?: number | undefined;
}

export interface ModeStats {
  total: number;
  active: number;
  resolved: number;
}

export interface ActivityStats {
  totalAdventures: number;
  activeAdventures: number;
  resolvedAdventures: number;
  byMode: {
    shanty: ModeStats;
    treasure: ModeStats;
    crew: ModeStats;
  };
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  dependencies?: DependencyHealth[] | undefined;
}

export interface DependencyHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number | undefined;
}

export interface ErrorResponse {
  code: string;
  message: string;
  details?: Record<string, unknown> | undefined;
}

// ─── API Client ─────────────────────────────────────────────────────────

export interface ApiClientOptions {
  /** Base URL of the backend API (default: E2E_BASE_URL env or http://localhost:4000) */
  baseUrl?: string | undefined;
  /** Request timeout in ms (default: 10000) */
  timeoutMs?: number | undefined;
}

/** Raw response from the API client, including status and headers */
export interface ApiResponse<T> {
  status: number;
  headers: Headers;
  body: T;
}

export class ApiClient {
  readonly baseUrl: string;
  readonly timeoutMs: number;

  constructor(options?: ApiClientOptions) {
    this.baseUrl = (options?.baseUrl ?? process.env['E2E_BASE_URL'] ?? 'http://localhost:4000').replace(/\/+$/, '');
    this.timeoutMs = options?.timeoutMs ?? 10_000;
  }

  // ─── Business Operations (start adventures) ─────────────────────────

  /** POST /api/pirate/shanty — start a sea shanty battle */
  async startShanty(): Promise<ApiResponse<AdventureStarted>> {
    return this.request<AdventureStarted>('/api/pirate/shanty', { method: 'POST' });
  }

  /** POST /api/pirate/treasure — start a treasure hunt */
  async seekTreasure(): Promise<ApiResponse<AdventureStarted>> {
    return this.request<AdventureStarted>('/api/pirate/treasure', { method: 'POST' });
  }

  /** POST /api/pirate/crew/enlist — enlist in pirate crew */
  async enlistInCrew(): Promise<ApiResponse<AdventureStarted>> {
    return this.request<AdventureStarted>('/api/pirate/crew/enlist', { method: 'POST' });
  }

  // ─── Adventure Management ───────────────────────────────────────────

  /** GET /api/pirate/adventures — list all adventures */
  async listAdventures(options?: {
    offset?: number | undefined;
    limit?: number | undefined;
  }): Promise<ApiResponse<AdventureList>> {
    const params = new URLSearchParams();
    if (options?.offset !== undefined) params.set('offset', String(options.offset));
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    const qs = params.toString();
    return this.request<AdventureList>(`/api/pirate/adventures${qs ? `?${qs}` : ''}`);
  }

  /** GET /api/pirate/adventures/{adventureId} — get adventure detail with parleys */
  async getAdventure(adventureId: string): Promise<ApiResponse<AdventureDetail>> {
    return this.request<AdventureDetail>(`/api/pirate/adventures/${adventureId}`);
  }

  // ─── Parley (continue chatting) ─────────────────────────────────────

  /** POST /api/pirate/adventures/{adventureId}/parley — send a message (JSON response) */
  async parley(adventureId: string, message: string): Promise<ApiResponse<ParleyMessage>> {
    return this.request<ParleyMessage>(`/api/pirate/adventures/${adventureId}/parley`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ message })
    });
  }

  /**
   * POST /api/pirate/adventures/{adventureId}/parley — send a message (SSE stream).
   *
   * Returns the raw Response object for SSE processing.
   * Use `sseCollector` to collect events from the response.
   */
  async parleyStream(adventureId: string, message: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/api/pirate/adventures/${adventureId}/parley`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream'
        },
        body: JSON.stringify({ message }),
        signal: controller.signal
      });

      // Don't clear timeout here — let the caller handle the stream within the timeout
      // But we do clear it to avoid leaks; stream consumption has its own timeout
      clearTimeout(timeout);
      return response;
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  // ─── Stats ──────────────────────────────────────────────────────────

  /** GET /api/pirate/stats — get activity statistics */
  async getStats(): Promise<ApiResponse<ActivityStats>> {
    return this.request<ActivityStats>('/api/pirate/stats');
  }

  // ─── Health ─────────────────────────────────────────────────────────

  /** GET /health — health check */
  async getHealth(): Promise<ApiResponse<HealthResponse>> {
    return this.request<HealthResponse>('/health');
  }

  /**
   * Raw request that returns status + headers + parsed body.
   * Returns ErrorResponse body for non-2xx responses.
   */
  async rawRequest(path: string, init?: RequestInit): Promise<ApiResponse<unknown>> {
    return this.request<unknown>(path, init);
  }

  // ─── Internal ───────────────────────────────────────────────────────

  private async request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal
      });
      clearTimeout(timeout);

      const contentType = response.headers.get('content-type') ?? '';
      let body: T;

      if (contentType.includes('application/json')) {
        body = (await response.json()) as T;
      } else {
        // For non-JSON responses, return text as-is (cast to T)
        body = (await response.text()) as T;
      }

      return { status: response.status, headers: response.headers, body };
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }
}

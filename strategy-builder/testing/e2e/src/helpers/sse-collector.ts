/**
 * SSE event collector — parses Server-Sent Events from a fetch Response.
 *
 * Handles the standard SSE format:
 *   event: <type>
 *   data: <json>
 *
 * Collects all events into an array and returns them when the stream ends
 * or a `[DONE]` marker / done event is received.
 */

export interface SSEEvent {
  /** Event type (from "event:" line). Undefined for unnamed events. */
  event?: string | undefined;
  /** Event data (from "data:" line, parsed as JSON if possible) */
  data: unknown;
  /** Raw data string before JSON parsing */
  rawData: string;
}

export interface SSECollectorOptions {
  /** Timeout for the entire stream in ms (default: 15000) */
  timeoutMs?: number | undefined;
  /** AbortSignal to cancel collection */
  signal?: AbortSignal | undefined;
}

export interface SSECollectorResult {
  events: SSEEvent[];
  /** Whether the stream ended with a done marker */
  done: boolean;
  /** Error message if the stream failed */
  error?: string | undefined;
}

/**
 * Collect all SSE events from a fetch Response.
 *
 * The Response must have been initiated with `Accept: text/event-stream`.
 * Reads the response body as text, splits into events, and parses each one.
 *
 * @param response - A fetch Response with an SSE body stream
 * @param options - Collection options (timeout, abort signal)
 */
export async function collectSSEEvents(response: Response, options?: SSECollectorOptions): Promise<SSECollectorResult> {
  const timeoutMs = options?.timeoutMs ?? 15_000;

  if (!response.body) {
    return { events: [], done: false, error: 'Response has no body' };
  }

  const events: SSEEvent[] = [];
  let done = false;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const timeoutPromise = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), timeoutMs));

  try {
    while (true) {
      if (options?.signal?.aborted) {
        return { events, done: false, error: 'Aborted' };
      }

      const readPromise = reader.read().then((result) => ({ type: 'data' as const, ...result }));
      const result = await Promise.race([readPromise, timeoutPromise]);

      if (result === 'timeout') {
        reader.cancel().catch(() => {});
        return { events, done: false, error: 'Stream timeout' };
      }

      if (result.done) {
        // Process any remaining buffer
        if (buffer.trim()) {
          const parsed = parseSSEBlock(buffer);
          if (parsed) {
            if (isDoneMarker(parsed)) {
              done = true;
            } else {
              events.push(parsed);
            }
          }
        }
        done = true;
        break;
      }

      buffer += decoder.decode(result.value, { stream: true });

      // SSE events are separated by double newlines
      const blocks = buffer.split(/\n\n/);
      // Keep the last partial block in the buffer
      buffer = blocks.pop() ?? '';

      for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed) continue;

        const parsed = parseSSEBlock(trimmed);
        if (parsed) {
          if (isDoneMarker(parsed)) {
            done = true;
            // Don't break — there might be trailing data, but we mark done
          } else {
            events.push(parsed);
          }
        }
      }
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    return { events, done: false, error };
  }

  return { events, done };
}

/**
 * Parse a single SSE block (lines between double newlines) into an SSEEvent.
 */
function parseSSEBlock(block: string): SSEEvent | null {
  let eventType: string | undefined;
  const dataLines: string[] = [];

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      eventType = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    } else if (line.startsWith(':')) {
      // Comment line — ignore
    }
  }

  if (dataLines.length === 0) return null;

  const rawData = dataLines.join('\n');

  // Try to parse as JSON
  let data: unknown;
  try {
    data = JSON.parse(rawData);
  } catch {
    data = rawData;
  }

  return { event: eventType, data, rawData };
}

/**
 * Check if an SSE event is a done marker.
 */
function isDoneMarker(event: SSEEvent): boolean {
  return (
    event.rawData === '[DONE]' || event.event === 'done' || (typeof event.data === 'string' && event.data === '[DONE]')
  );
}

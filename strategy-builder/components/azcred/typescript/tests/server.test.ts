import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

// ─── Mock AzureCliCredential ────────────────────────────────────────────

// vi.hoisted ensures the mock fn is available when vi.mock runs (hoisted above imports)
const mockGetToken = vi.hoisted(() => vi.fn());

vi.mock('@azure/identity', () => ({
  AzureCliCredential: vi.fn().mockImplementation(() => ({
    getToken: mockGetToken
  }))
}));

// Import AFTER mocks are set up (vitest hoists vi.mock automatically)
import { buildServer } from '../src/server.ts';

// ─── Tests ──────────────────────────────────────────────────────────────

describe('az credential sidecar server', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  // ── GET /health ─────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/health'
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    });
  });

  // ── GET /token ──────────────────────────────────────────────────────

  describe('GET /token', () => {
    it('returns token for valid resource', async () => {
      const expiresOnMs = Date.now() + 3600_000;
      mockGetToken.mockResolvedValueOnce({
        token: 'mock-access-token',
        expiresOnTimestamp: expiresOnMs
      });

      const response = await server.inject({
        method: 'GET',
        url: '/token?resource=https://management.azure.com'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.access_token).toBe('mock-access-token');
      expect(body.tokenType).toBe('Bearer');
      expect(body.resource).toBe('https://management.azure.com');
      expect(body.expires_on).toBeTypeOf('number');
      expect(body.expiresOn).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO string
    });

    it('appends /.default to resource scope', async () => {
      mockGetToken.mockResolvedValueOnce({
        token: 'tok',
        expiresOnTimestamp: Date.now() + 3600_000
      });

      await server.inject({
        method: 'GET',
        url: '/token?resource=https://management.azure.com'
      });

      expect(mockGetToken).toHaveBeenCalledWith('https://management.azure.com/.default');
    });

    it('does not double-append /.default', async () => {
      mockGetToken.mockResolvedValueOnce({
        token: 'tok',
        expiresOnTimestamp: Date.now() + 3600_000
      });

      await server.inject({
        method: 'GET',
        url: '/token?resource=https://management.azure.com/.default'
      });

      expect(mockGetToken).toHaveBeenCalledWith('https://management.azure.com/.default');
    });

    it('returns 400 when resource is missing', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/token'
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('resource');
    });

    it('returns 500 when credential acquisition fails', async () => {
      mockGetToken.mockRejectedValueOnce(new Error('az CLI not logged in'));

      const response = await server.inject({
        method: 'GET',
        url: '/token?resource=https://management.azure.com'
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().error).toContain('az CLI not logged in');
    });
  });

  // ── POST /token ─────────────────────────────────────────────────────

  describe('POST /token', () => {
    it('returns token for form-urlencoded body', async () => {
      const expiresOnMs = Date.now() + 3600_000;
      mockGetToken.mockResolvedValueOnce({
        token: 'mock-post-token',
        expiresOnTimestamp: expiresOnMs
      });

      const response = await server.inject({
        method: 'POST',
        url: '/token',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'resource=https://management.azure.com'
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.access_token).toBe('mock-post-token');
      expect(body.tokenType).toBe('Bearer');
      expect(body.resource).toBe('https://management.azure.com');
    });

    it('returns token for JSON body', async () => {
      mockGetToken.mockResolvedValueOnce({
        token: 'mock-json-token',
        expiresOnTimestamp: Date.now() + 3600_000
      });

      const response = await server.inject({
        method: 'POST',
        url: '/token',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ resource: 'https://cognitiveservices.azure.com' })
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.access_token).toBe('mock-json-token');
      expect(body.resource).toBe('https://cognitiveservices.azure.com');
    });

    it('returns 400 when resource is missing from form body', async () => {
      const response = await server.inject({
        method: 'POST',
        url: '/token',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'foo=bar'
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('resource');
    });

    it('returns 500 when credential acquisition fails on POST', async () => {
      mockGetToken.mockRejectedValueOnce(new Error('token expired'));

      const response = await server.inject({
        method: 'POST',
        url: '/token',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'resource=https://management.azure.com'
      });

      expect(response.statusCode).toBe(500);
      expect(response.json().error).toContain('token expired');
    });
  });

  // ── 404 for unknown routes ──────────────────────────────────────────

  describe('unknown routes', () => {
    it('returns 404 for GET /', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/'
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for GET /unknown', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/unknown'
      });

      expect(response.statusCode).toBe(404);
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  isUserIssuedApiKeyMaterial,
  MCP_URL_API_KEY_JSONRPC,
  rejectMcpRequestIfApiKeyInUrl,
  requestPresentsApiKeyInUrl,
  URL_API_CREDENTIAL_REJECTION,
} from './url-credentials';

describe('url-credentials', () => {
  describe('isUserIssuedApiKeyMaterial', () => {
    it('matches live and test gf_ keys', () => {
      expect(isUserIssuedApiKeyMaterial('gf_live_abc')).toBe(true);
      expect(isUserIssuedApiKeyMaterial('gf_test_abc')).toBe(true);
      expect(isUserIssuedApiKeyMaterial('  gf_LIVE_abc  ')).toBe(true);
    });

    it('does not match ids, webhook tokens, or unrelated prefixes', () => {
      expect(isUserIssuedApiKeyMaterial('apikey_123')).toBe(false);
      expect(isUserIssuedApiKeyMaterial('gf_something_else')).toBe(false);
      expect(isUserIssuedApiKeyMaterial('webhook-shared-secret')).toBe(false);
    });
  });

  describe('requestPresentsApiKeyInUrl', () => {
    it('rejects named credential query keys with any value', () => {
      expect(
        requestPresentsApiKeyInUrl({ query: { api_key: 'not-even-gf' } }),
      ).toBe(true);
      expect(requestPresentsApiKeyInUrl({ query: { apiKey: 'secret' } })).toBe(
        true,
      );
      expect(
        requestPresentsApiKeyInUrl({ query: { access_token: 'jwt' } }),
      ).toBe(true);
    });

    it('rejects a gf_ key in any query value, including token=', () => {
      expect(
        requestPresentsApiKeyInUrl({
          query: { token: 'gf_live_should-not-be-here' },
        }),
      ).toBe(true);
    });

    it('rejects a gf_ key as a path segment', () => {
      expect(
        requestPresentsApiKeyInUrl({ path: '/v1/gf_test_abc/posts' }),
      ).toBe(true);
      expect(
        requestPresentsApiKeyInUrl({
          originalUrl: '/v1/gf_live_abc?page=1',
        }),
      ).toBe(true);
    });

    it('rejects a gf_ key in a route param', () => {
      expect(
        requestPresentsApiKeyInUrl({
          params: { id: 'gf_live_abc' },
        }),
      ).toBe(true);
    });

    it('allows webhook token query params that are not gf_ keys', () => {
      expect(
        requestPresentsApiKeyInUrl({
          path: '/webhooks/heygen',
          query: { token: 'vendor-shared-secret' },
        }),
      ).toBe(false);
    });

    it('allows ordinary list query params', () => {
      expect(
        requestPresentsApiKeyInUrl({
          path: '/v1/posts',
          query: { limit: '20', page: '1', search: 'gf_something' },
        }),
      ).toBe(false);
    });

    it('allows Authorization-only requests', () => {
      expect(requestPresentsApiKeyInUrl({ path: '/v1/posts', query: {} })).toBe(
        false,
      );
    });
  });

  describe('rejectMcpRequestIfApiKeyInUrl', () => {
    function createResponse(): {
      json: ReturnType<typeof vi.fn>;
      setHeader: ReturnType<typeof vi.fn>;
      status: ReturnType<typeof vi.fn>;
    } {
      const json = vi.fn();
      const setHeader = vi.fn();
      const status = vi.fn().mockReturnValue({ json });
      return { json, setHeader, status };
    }

    it('writes the Streamable HTTP JSON-RPC 401 when a gf_ key is in the query', () => {
      const response = createResponse();

      expect(
        rejectMcpRequestIfApiKeyInUrl(
          { path: '/mcp', query: { api_key: 'gf_live_abc' } },
          response,
          'Bearer realm="mcp"',
        ),
      ).toBe(true);

      expect(response.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        'Bearer realm="mcp"',
      );
      expect(response.status).toHaveBeenCalledWith(401);
      expect(response.json).toHaveBeenCalledWith(MCP_URL_API_KEY_JSONRPC);
      expect(MCP_URL_API_KEY_JSONRPC.error.message).toBe(
        URL_API_CREDENTIAL_REJECTION,
      );
    });

    it('does not write a response when the key is only in Authorization', () => {
      const response = createResponse();

      expect(
        rejectMcpRequestIfApiKeyInUrl(
          { path: '/mcp', query: {} },
          response,
          'Bearer realm="mcp"',
        ),
      ).toBe(false);

      expect(response.setHeader).not.toHaveBeenCalled();
      expect(response.status).not.toHaveBeenCalled();
    });
  });
});

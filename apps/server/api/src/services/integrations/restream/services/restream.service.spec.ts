import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RESTREAM_OAUTH_SCOPE, RestreamService } from './restream.service';

describe('RestreamService', () => {
  const config = {
    get: vi.fn((key: string) => {
      const map: Record<string, string> = {
        GENFEEDAI_APP_URL: 'https://app.genfeed.ai',
        RESTREAM_CLIENT_ID: 'client-id',
        RESTREAM_CLIENT_SECRET: 'client-secret',
        RESTREAM_REDIRECT_URI: 'https://app.genfeed.ai/oauth/restream',
      };
      return map[key];
    }),
  };
  const http = { post: vi.fn(), get: vi.fn() };
  const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };

  let service: RestreamService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RestreamService(
      config as never,
      http as never,
      logger as never,
    );
  });

  it('is configured when env is present', () => {
    expect(service.isConfigured()).toBe(true);
  });

  it('is not configured when Restream env is missing', () => {
    const missing = new RestreamService(
      { get: vi.fn(() => undefined) } as never,
      http as never,
      logger as never,
    );
    expect(missing.isConfigured()).toBe(false);
  });

  it('builds authorize URL with response_type=code and chat/profile scopes', () => {
    const url = service.generateAuthUrl('state-1');
    const parsed = new URL(url);
    expect(url).toContain('https://api.restream.io/login');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe('client-id');
    expect(parsed.searchParams.get('state')).toBe('state-1');
    expect(parsed.searchParams.has('scope')).toBe(true);
    expect(parsed.searchParams.get('scope')).toBe(RESTREAM_OAUTH_SCOPE);
    expect(parsed.searchParams.get('scope')).toContain('chat.read');
    expect(parsed.searchParams.get('scope')).toContain('profile.read');
  });

  it('builds chat websocket URL', () => {
    expect(service.buildChatWebSocketUrl('tok')).toBe(
      'wss://chat.api.restream.io/ws?accessToken=tok',
    );
  });
});

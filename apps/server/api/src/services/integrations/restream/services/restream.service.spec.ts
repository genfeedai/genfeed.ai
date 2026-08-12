import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RestreamService } from './restream.service';

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

  it('builds authorize URL with response_type=code', () => {
    const url = service.generateAuthUrl('state-1');
    expect(url).toContain('https://api.restream.io/login');
    expect(url).toContain('response_type=code');
    expect(url).toContain('client_id=client-id');
    expect(url).toContain('state=state-1');
  });

  it('builds chat websocket URL', () => {
    expect(service.buildChatWebSocketUrl('tok')).toBe(
      'wss://chat.api.restream.io/ws?accessToken=tok',
    );
  });
});

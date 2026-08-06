import { LoggerService } from '@libs/logger/logger.service';
import { ConfigService } from '@mcp/config/config.service';
import { PostHogAnalyticsService } from '@mcp/services/posthog-analytics.service';
import type { Server } from '@modelcontextprotocol/sdk/server';

const mocks = vi.hoisted(() => ({
  instrument: vi.fn(),
  posthog: vi.fn(function MockPostHog() {
    return { _shutdown: mocks.shutdown };
  }),
  shutdown: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@posthog/mcp', () => ({
  instrument: mocks.instrument,
  PostHog: mocks.posthog,
}));

function makeLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function makeConfig(
  token = 'phc_test_key',
  host = 'https://eu.i.posthog.com',
): ConfigService {
  return {
    get: vi.fn((key: string) => {
      if (key === 'POSTHOG_PROJECT_API_KEY') return token;
      if (key === 'POSTHOG_HOST') return host;
      return undefined;
    }),
  } as unknown as ConfigService;
}

describe('PostHogAnalyticsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('instruments MCP lifecycle events with canonical user and organization identity', () => {
    const service = new PostHogAnalyticsService(makeConfig(), makeLogger());
    const server = {} as Server;

    service.instrumentServer(server, {
      organizationId: 'organization-123',
      role: 'admin',
      userId: 'user-123',
    });

    expect(mocks.instrument).toHaveBeenCalledOnce();
    const options = mocks.instrument.mock.calls[0][2];
    expect(options).toMatchObject({
      context: false,
      enableConversationId: false,
      enableExceptionAutocapture: false,
      identify: {
        distinctId: 'user-123',
        groups: { organization: 'organization-123' },
      },
    });
    expect(options.eventProperties()).toEqual({
      app_surface: 'mcp.genfeed.ai',
      mcp_role: 'admin',
      service: 'mcp',
    });
  });

  it('removes parameters, responses, intent, and free-form errors', () => {
    const service = new PostHogAnalyticsService(makeConfig(), makeLogger());
    service.instrumentServer({} as Server);
    const options = mocks.instrument.mock.calls[0][2];
    const event = {
      distinct_id: 'session-123',
      event: '$mcp_tool_call',
      properties: {
        $mcp_error_message: 'private error',
        $mcp_intent: 'private intent',
        $mcp_intent_source: 'context_parameter',
        $mcp_parameters: { apiKey: 'secret' },
        $mcp_response: { content: 'private response' },
        $mcp_tool_name: 'create_post',
      },
      timestamp: new Date().toISOString(),
      type: 'capture' as const,
    };

    expect(options.beforeSend(event)).toEqual({
      ...event,
      properties: { $mcp_tool_name: 'create_post' },
    });
  });

  it('does nothing when the project token is absent', () => {
    const service = new PostHogAnalyticsService(makeConfig(''), makeLogger());

    service.instrumentServer({} as Server);

    expect(mocks.instrument).not.toHaveBeenCalled();
  });

  it('uses the default PostHog host when configuration is empty', () => {
    new PostHogAnalyticsService(makeConfig('phc_test_key', ''), makeLogger());

    expect(mocks.posthog).toHaveBeenCalledWith('phc_test_key', {
      host: 'https://eu.i.posthog.com',
    });
  });

  it('flushes queued analytics during shutdown', async () => {
    const service = new PostHogAnalyticsService(makeConfig(), makeLogger());

    await service.onModuleDestroy();

    expect(mocks.shutdown).toHaveBeenCalledWith(5_000);
  });
});

import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { McpConnectionVerificationService } from '@api/collections/api-keys/services/mcp-connection-verification.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { API_KEY_SCOPE_PRESETS } from '@genfeedai/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import axios from 'axios';

vi.mock('axios');

const mockedAxios = vi.mocked(axios, true);

describe('McpConnectionVerificationService', () => {
  const apiKey = {
    expiresAt: null,
    id: 'key-1',
    key: 'hashed-key',
    metadata: {},
    scopes: [...API_KEY_SCOPE_PRESETS.mcp],
  } as ApiKeyDocument;
  const apiKeysService = {
    findOne: vi.fn(),
    patch: vi.fn(),
    verifyApiKey: vi.fn(),
  };
  const configService = {
    get: vi.fn(() => 'http://mcp:3014'),
  };
  const credentialsService = {
    countConnected: vi.fn(),
  };
  const get = vi.fn();
  const post = vi.fn();
  const logger = {
    warn: vi.fn(),
  };
  let service: McpConnectionVerificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedAxios.create.mockReturnValue({
      get,
      post,
    } as unknown as ReturnType<typeof axios.create>);
    apiKeysService.findOne.mockResolvedValue(apiKey);
    apiKeysService.verifyApiKey.mockResolvedValue(true);
    apiKeysService.patch.mockResolvedValue(apiKey);
    credentialsService.countConnected.mockResolvedValue(1);
    post.mockResolvedValue({
      data: {
        id: 'connect-genfeed-verification',
        jsonrpc: '2.0',
        result: { tools: [{ name: 'list_brands' }] },
      },
    });
    get.mockResolvedValue({
      data: { tools: [{ name: 'list_brands' }] },
    });

    service = new McpConnectionVerificationService(
      apiKeysService as unknown as ApiKeysService,
      configService as unknown as ConfigService,
      credentialsService as unknown as CredentialsService,
      logger as unknown as LoggerService,
    );
  });

  it('verifies tool discovery and records a secret-free connection marker', async () => {
    const result = await service.verify({
      apiKeyId: 'key-1',
      organizationId: 'org-1',
      plainKey: 'gf_test_secret-value',
      userId: 'user-1',
    });

    expect(result).toEqual({
      keyId: 'key-1',
      publishing: {
        connectedAccountCount: 1,
        isReady: true,
      },
      status: 'connected',
      verifiedAt: expect.any(String),
    });
    expect(post).toHaveBeenCalledWith(
      'http://mcp:3014/mcp',
      expect.objectContaining({ method: 'tools/list' }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer gf_test_secret-value',
        }),
        timeout: 5000,
      }),
    );
    expect(apiKeysService.patch).toHaveBeenCalledWith(
      'key-1',
      expect.objectContaining({
        metadata: expect.objectContaining({
          connectGenfeed: expect.objectContaining({
            lastVerifiedAt: expect.any(String),
            transport: 'streamable-http',
          }),
        }),
      }),
    );
    expect(JSON.stringify(apiKeysService.patch.mock.calls)).not.toContain(
      'gf_test_secret-value',
    );
  });

  it('falls back to the authenticated tool-registry mirror for lifecycle responses', async () => {
    post.mockResolvedValue({
      data: {
        error: { code: -32_000, message: 'Server not initialized' },
        id: 'connect-genfeed-verification',
        jsonrpc: '2.0',
      },
    });
    await expect(
      service.verify({
        apiKeyId: 'key-1',
        organizationId: 'org-1',
        plainKey: 'gf_test_secret-value',
        userId: 'user-1',
      }),
    ).resolves.toMatchObject({ status: 'connected' });

    expect(get).toHaveBeenCalledWith('http://mcp:3014/v1/tools', {
      headers: {
        Authorization: 'Bearer gf_test_secret-value',
      },
      timeout: 5000,
    });
  });

  it('falls back to the registry mirror after an HTTP lifecycle rejection', async () => {
    post.mockRejectedValue({ response: { status: 400 } });

    await expect(
      service.verify({
        apiKeyId: 'key-1',
        organizationId: 'org-1',
        plainKey: 'gf_test_secret-value',
        userId: 'user-1',
      }),
    ).resolves.toMatchObject({ status: 'connected' });

    expect(get).toHaveBeenCalledOnce();
  });

  it('preserves a configured reverse-proxy path for the registry mirror', async () => {
    configService.get.mockReturnValueOnce('https://example.com/genfeed');
    post.mockRejectedValue({ response: { status: 400 } });

    await expect(
      service.verify({
        apiKeyId: 'key-1',
        organizationId: 'org-1',
        plainKey: 'gf_test_secret-value',
        userId: 'user-1',
      }),
    ).resolves.toMatchObject({ status: 'connected' });

    expect(get).toHaveBeenCalledWith(
      'https://example.com/genfeed/v1/tools',
      expect.any(Object),
    );
  });

  it('reports unavailable verification when the MCP endpoint is not configured', async () => {
    configService.get.mockReturnValueOnce('');

    await expect(
      service.verify({
        apiKeyId: 'key-1',
        organizationId: 'org-1',
        plainKey: 'gf_test_secret-value',
        userId: 'user-1',
      }),
    ).resolves.toMatchObject({
      reason: 'unreachable_endpoint',
      status: 'failed',
    });

    expect(post).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects a secret that does not match the selected key', async () => {
    apiKeysService.verifyApiKey.mockResolvedValue(false);

    await expect(
      service.verify({
        apiKeyId: 'key-1',
        organizationId: 'org-1',
        plainKey: 'gf_test_wrong-value',
        userId: 'user-1',
      }),
    ).resolves.toMatchObject({
      reason: 'invalid_key',
      status: 'failed',
    });
    expect(post).not.toHaveBeenCalled();
  });

  it('reports missing MCP scopes before contacting the MCP service', async () => {
    apiKeysService.findOne.mockResolvedValue({
      ...apiKey,
      scopes: ['brands:read'],
    });

    await expect(
      service.verify({
        apiKeyId: 'key-1',
        organizationId: 'org-1',
        plainKey: 'gf_test_secret-value',
        userId: 'user-1',
      }),
    ).resolves.toMatchObject({
      missingScopes: expect.arrayContaining(['posts:create', 'analytics:read']),
      reason: 'invalid_scope',
      status: 'failed',
    });
    expect(post).not.toHaveBeenCalled();
  });

  it('classifies an unreachable MCP endpoint without exposing the key', async () => {
    post.mockRejectedValue({ code: 'ECONNREFUSED' });
    get.mockRejectedValue({ code: 'ECONNREFUSED' });

    const result = await service.verify({
      apiKeyId: 'key-1',
      organizationId: 'org-1',
      plainKey: 'gf_test_secret-value',
      userId: 'user-1',
    });

    expect(result).toMatchObject({
      reason: 'unreachable_endpoint',
      status: 'failed',
    });
    expect(JSON.stringify(result)).not.toContain('gf_test_secret-value');
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
      'gf_test_secret-value',
    );
    expect(apiKeysService.patch).not.toHaveBeenCalled();
  });

  it('reports missing publishing integration after a valid connection', async () => {
    credentialsService.countConnected.mockResolvedValue(0);

    await expect(
      service.verify({
        apiKeyId: 'key-1',
        organizationId: 'org-1',
        plainKey: 'gf_test_secret-value',
        userId: 'user-1',
      }),
    ).resolves.toMatchObject({
      publishing: {
        connectedAccountCount: 0,
        isReady: false,
      },
      status: 'connected',
    });
  });
});

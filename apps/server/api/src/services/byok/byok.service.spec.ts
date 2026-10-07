const crunCache = {
  claimCrunRequestSlot: vi
    .fn()
    .mockResolvedValue({ isAdmitted: true, retryAfterMs: 0 }),
};

import { ByokService } from '@api/services/byok/byok.service';
import { ByokProvider } from '@genfeedai/contracts';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { ForbiddenException } from '@nestjs/common';
import { of, throwError } from 'rxjs';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => `decrypted:${value}`),
    encrypt: vi.fn((value: string) => `encrypted:${value}`),
  },
}));

describe('ByokService subscription entitlement', () => {
  const organizationSettingsService = { findOne: vi.fn() };
  const subscriptionGate = vi.fn();
  const organizationPaidAccessService = {
    isSubscriptionGated: subscriptionGate,
    isSubscriptionGatedStrict: subscriptionGate,
  };
  const logger = { error: vi.fn(), log: vi.fn() };
  const service = new ByokService(
    organizationSettingsService as never,
    organizationPaidAccessService as never,
    {} as never,
    logger as never,
    {} as never,
    crunCache as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    organizationSettingsService.findOne.mockResolvedValue({
      byokKeys: {
        [ByokProvider.REPLICATE]: {
          apiKey: 'stored-key',
          isEnabled: true,
          provider: ByokProvider.REPLICATE,
        },
      },
    });
  });

  it('drains a retained disabled Crun key using the real OrganizationSetting scope without admission checks', async () => {
    organizationSettingsService.findOne.mockResolvedValue({
      byokKeys: {
        [ByokProvider.CRUN]: {
          apiKey: 'retained-key',
          isEnabled: false,
          provider: ByokProvider.CRUN,
        },
      },
    });
    subscriptionGate.mockResolvedValue(true);
    await expect(service.lookupRetainedCrunApiKey('org-1')).resolves.toEqual({
      apiKey: 'decrypted:retained-key',
    });
    expect(organizationSettingsService.findOne).toHaveBeenCalledWith({
      organizationId: 'org-1',
    });
    expect(subscriptionGate).not.toHaveBeenCalled();
  });
  it('resolves a stored key for an entitled organization', async () => {
    organizationPaidAccessService.isSubscriptionGated.mockResolvedValue(false);

    await expect(
      service.resolveApiKey('org-1', ByokProvider.REPLICATE),
    ).resolves.toEqual({
      apiKey: 'decrypted:stored-key',
      apiSecret: undefined,
    });
    await expect(
      service.isByokActiveForProvider('org-1', ByokProvider.REPLICATE),
    ).resolves.toBe(true);
  });

  it('ignores a stored key while the organization has no paid subscription', async () => {
    organizationPaidAccessService.isSubscriptionGated.mockResolvedValue(true);

    await expect(
      service.resolveApiKey('org-1', ByokProvider.REPLICATE),
    ).resolves.toBeUndefined();
    await expect(
      service.isByokActiveForProvider('org-1', ByokProvider.REPLICATE),
    ).resolves.toBe(false);
  });

  it('skips the subscription read when no key is stored', async () => {
    await expect(
      service.resolveApiKey('org-1', ByokProvider.OPENAI),
    ).resolves.toBeUndefined();
    expect(
      organizationPaidAccessService.isSubscriptionGated,
    ).not.toHaveBeenCalled();
  });

  it('throws from lookupApiKey when the settings read fails, while resolveApiKey still reads it as no key', async () => {
    organizationSettingsService.findOne.mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(
      service.lookupApiKey('org-1', ByokProvider.REPLICATE),
    ).rejects.toThrow('database unavailable');
    await expect(
      service.resolveApiKey('org-1', ByokProvider.REPLICATE),
    ).resolves.toBeUndefined();
  });

  it('returns undefined from lookupApiKey only for a confirmed-missing key', async () => {
    await expect(
      service.lookupApiKey('org-1', ByokProvider.OPENAI),
    ).resolves.toBeUndefined();
  });

  it('keeps credential identity stable across usage counters and settings timestamps', async () => {
    organizationPaidAccessService.isSubscriptionGated.mockResolvedValue(false);
    const original = await service.lookupApiKeyWithIdentity(
      'org-1',
      ByokProvider.REPLICATE,
    );
    organizationSettingsService.findOne.mockResolvedValue({
      updatedAt: new Date('2026-09-30T12:00:00Z'),
      byokKeys: {
        [ByokProvider.REPLICATE]: {
          apiKey: 'stored-key',
          isEnabled: true,
          totalRequests: 42,
          lastUsedAt: new Date('2026-09-30T12:00:00Z'),
          provider: ByokProvider.REPLICATE,
        },
      },
    });
    const used = await service.lookupApiKeyWithIdentity(
      'org-1',
      ByokProvider.REPLICATE,
    );
    expect(used?.credentialId).toBe(original?.credentialId);
    expect(used?.credentialId).toMatch(/^[a-f0-9]{64}$/);
    expect(used?.apiKey).toBe('decrypted:stored-key');
  });

  it('changes credential identity on replacement and scopes it to the organization', async () => {
    organizationPaidAccessService.isSubscriptionGated.mockResolvedValue(false);
    const original = await service.lookupApiKeyWithIdentity(
      'org-1',
      ByokProvider.REPLICATE,
    );
    const foreign = await service.lookupApiKeyWithIdentity(
      'org-2',
      ByokProvider.REPLICATE,
    );
    expect(foreign?.credentialId).not.toBe(original?.credentialId);
    organizationSettingsService.findOne.mockResolvedValue({
      byokKeys: {
        [ByokProvider.REPLICATE]: {
          apiKey: 'replacement-key',
          isEnabled: true,
          provider: ByokProvider.REPLICATE,
        },
      },
    });
    const replaced = await service.lookupApiKeyWithIdentity(
      'org-1',
      ByokProvider.REPLICATE,
    );
    expect(replaced?.credentialId).not.toBe(original?.credentialId);
  });

  it('does not turn a strict credential identity lookup failure into a platform route', async () => {
    organizationSettingsService.findOne.mockRejectedValue(
      new Error('database unavailable'),
    );
    await expect(
      service.lookupApiKeyWithIdentity('org-1', ByokProvider.REPLICATE),
    ).rejects.toThrow('database unavailable');
  });

  it('propagates decryption errors from identity lookup', async () => {
    organizationPaidAccessService.isSubscriptionGated.mockResolvedValue(false);
    vi.mocked(EncryptionUtil.decrypt).mockImplementationOnce(() => {
      throw new Error('cannot decrypt');
    });
    await expect(
      service.lookupApiKeyWithIdentity('org-1', ByokProvider.REPLICATE),
    ).rejects.toThrow('cannot decrypt');
  });

  it('refuses to store a key without a paid subscription', async () => {
    organizationPaidAccessService.isSubscriptionGated.mockResolvedValue(true);

    await expect(
      service.saveKey('org-1', ByokProvider.REPLICATE, 'new-key'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.saveOAuthKey('org-1', ByokProvider.OPENAI, {
        apiKey: 'token',
        isEnabled: true,
        provider: ByokProvider.OPENAI,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(organizationSettingsService.findOne).not.toHaveBeenCalled();
  });
});

describe('ByokService Argil validation', () => {
  const httpService = { get: vi.fn() };
  const logger = { error: vi.fn() };
  const service = new ByokService(
    {} as never,
    {} as never,
    httpService as never,
    logger as never,
    {} as never,
    crunCache as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates an Argil key against the avatars endpoint', async () => {
    httpService.get.mockReturnValue(of({ data: [] }));

    await expect(
      service.validateKey(ByokProvider.ARGIL, 'argil-key'),
    ).resolves.toEqual({ isValid: true });
    expect(httpService.get).toHaveBeenCalledWith(
      'https://api.argil.ai/v1/avatars',
      { headers: { 'x-api-key': 'argil-key' }, timeout: 15_000 },
    );
  });

  it('rejects an invalid Argil key', async () => {
    httpService.get.mockReturnValue(
      throwError(() => new Error('unauthorized')),
    );

    await expect(
      service.validateKey(ByokProvider.ARGIL, 'invalid-key'),
    ).resolves.toEqual({ error: 'Invalid Argil API key', isValid: false });
  });
});

describe('ByokService OpenRouter validation', () => {
  const httpService = { post: vi.fn() };
  const logger = { error: vi.fn() };
  const service = new ByokService(
    {} as never,
    {} as never,
    httpService as never,
    logger as never,
    {} as never,
    crunCache as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts zdr and deny data_collection on first-party validation', async () => {
    httpService.post.mockReturnValue(of({ data: {} }));

    await expect(
      service.validateKey(ByokProvider.OPENROUTER, 'or-key'),
    ).resolves.toEqual({ isValid: true });

    expect(httpService.post).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        provider: { data_collection: 'deny', zdr: true },
      }),
      { headers: { Authorization: 'Bearer or-key' } },
    );
  });

  it('returns invalid-key copy for 401 responses', async () => {
    httpService.post.mockReturnValue(
      throwError(() => ({
        response: { status: 401, data: { error: { message: 'Unauthorized' } } },
      })),
    );

    await expect(
      service.validateKey(ByokProvider.OPENROUTER, 'bad-key'),
    ).resolves.toEqual({
      error: 'Invalid OpenRouter API key',
      isValid: false,
    });
  });

  it('reports a first-party routing reject without calling the key invalid', async () => {
    httpService.post.mockReturnValue(
      throwError(() => ({
        response: {
          data: {
            error: {
              message: 'No endpoints found matching your data policy',
            },
          },
          status: 404,
        },
      })),
    );

    await expect(
      service.validateKey(ByokProvider.OPENROUTER, 'valid-key'),
    ).resolves.toEqual({
      error:
        'OpenRouter rejected the key under first-party routing (zdr / no data collection)',
      isValid: false,
    });
  });
});

// #5294 `saveKey` never validated the key it persisted, so a Pro org could
// save any string and have image/video credit services treat it as an active
// BYOK provider. Mock `validateKey` itself here — no real provider calls.
describe('ByokService saveKey validation (#5294)', () => {
  const logger = { error: vi.fn(), log: vi.fn() };
  const organizationPaidAccessService = {
    isSubscriptionGated: vi.fn().mockResolvedValue(false),
  };
  const existingSetting = {
    byokKeys: {},
    id: 'setting-1',
    organizationId: 'org-1',
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const tx = {
    organizationSetting: {
      findFirst: vi.fn().mockResolvedValue(existingSetting),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  };
  const service = new ByokService(
    {} as never,
    organizationPaidAccessService as never,
    {} as never,
    logger as never,
    prisma as never,
    crunCache as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    organizationPaidAccessService.isSubscriptionGated.mockResolvedValue(false);
    tx.organizationSetting.findFirst.mockResolvedValue(existingSetting);
    tx.organizationSetting.updateMany.mockResolvedValue({ count: 1 });
  });

  it('rejects an invalid key before persisting anything', async () => {
    vi.spyOn(service, 'validateKey').mockResolvedValue({
      error: 'Invalid Replicate API key',
      isValid: false,
    });

    await expect(
      service.saveKey('org-1', ByokProvider.REPLICATE, 'not-a-real-key'),
    ).rejects.toThrow('Invalid Replicate API key');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.organizationSetting.updateMany).not.toHaveBeenCalled();
  });

  it('persists the key only after validation passes', async () => {
    vi.spyOn(service, 'validateKey').mockResolvedValue({ isValid: true });

    await service.saveKey('org-1', ByokProvider.REPLICATE, 'r8_live_key');

    expect(service.validateKey).toHaveBeenCalledWith(
      ByokProvider.REPLICATE,
      'r8_live_key',
      undefined,
    );
    expect(tx.organizationSetting.updateMany).toHaveBeenCalledOnce();
  });
});

describe('ByokService Crun harmless credential verification', () => {
  const http = { post: vi.fn() };
  const service = new ByokService(
    {} as never,
    {} as never,
    http as never,
    { error: vi.fn() } as never,
    {} as never,
    crunCache as never,
  );
  beforeEach(() => {
    vi.clearAllMocks();
    crunCache.claimCrunRequestSlot.mockResolvedValue({
      isAdmitted: true,
      retryAfterMs: 0,
    });
  });
  it('only estimates the fixed harmless payload and accepts a valid fractional envelope', async () => {
    http.post.mockReturnValue(
      of({
        status: 200,
        data: {
          code: 200,
          message: 'ok',
          data: { credits: 1.5, estimated: true },
        },
      }),
    );
    expect(await service.validateKey(ByokProvider.CRUN, 'fixture-key')).toEqual(
      { isValid: true },
    );
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(http.post).toHaveBeenCalledWith(
      'https://api.crun.ai/api/v1/client/job/estimate-credits',
      {
        model: 'google/nano-banana-pro',
        input: {
          prompt: 'Credential verification',
          resolution: '1K',
          aspect_ratio: '1:1',
          output_format: 'png',
        },
      },
      { headers: { 'X-API-KEY': 'fixture-key' }, timeout: 15000 },
    );
  });
  it.each([
    {},
    { code: 402, message: 'secret', data: { credits: 8, estimated: false } },
    { code: 200, message: 'ok', data: { credits: '8', estimated: false } },
  ])(
    'rejects invalid envelope without exposing upstream details',
    async (data) => {
      http.post.mockReturnValue(of({ status: 200, data }));
      expect(
        await service.validateKey(ByokProvider.CRUN, 'fixture-key'),
      ).toEqual({
        isValid: false,
        error: 'Crun credential verification was refused',
      });
    },
  );
  it('redacts transport errors', async () => {
    http.post.mockReturnValue(throwError(() => new Error('private api key')));
    expect(await service.validateKey(ByokProvider.CRUN, 'fixture-key')).toEqual(
      { isValid: false, error: 'Crun credential verification is unavailable' },
    );
  });
  it('shares the fingerprint account gate and makes no verification request when throttled', async () => {
    crunCache.claimCrunRequestSlot.mockResolvedValueOnce({
      isAdmitted: false,
      retryAfterMs: 10000,
    });
    expect(await service.validateKey(ByokProvider.CRUN, 'fixture-key')).toEqual(
      { isValid: false, error: 'Crun credential verification is unavailable' },
    );
    expect(http.post).not.toHaveBeenCalled();
    expect(crunCache.claimCrunRequestSlot).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });
});

describe('ByokService explicit direct-provider credentials', () => {
  const apiKey = 'fixture-direct-credential';
  const providers = [
    {
      provider: ByokProvider.GOOGLE,
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: { name: 'models/gemini-3.1-flash-image' },
      label: 'Google Gemini API',
      docsUrl: 'https://aistudio.google.com/apikey',
    },
    {
      provider: ByokProvider.XAI,
      url: 'https://api.x.ai/v1/api-key',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: {
        api_key_blocked: false,
        api_key_disabled: false,
        team_blocked: false,
        acls: ['api-key:model:*', 'api-key:endpoint:*'],
      },
      label: 'xAI',
      docsUrl: 'https://console.x.ai',
    },
    {
      provider: ByokProvider.BFL,
      url: 'https://api.bfl.ai/v1/credits',
      headers: { accept: 'application/json', 'x-key': apiKey },
      body: { credits: 0 },
      label: 'Black Forest Labs',
      docsUrl: 'https://api.bfl.ai',
    },
    {
      provider: ByokProvider.RUNWAY,
      url: 'https://api.dev.runwayml.com/v1/organization',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Runway-Version': '2024-11-06',
        'Content-Type': 'application/json',
      },
      body: { creditBalance: 0 },
      label: 'Runway',
      docsUrl: 'https://dev.runwayml.com',
    },
  ];
  const transport = vi.fn<typeof fetch>();
  const settings = { findOne: vi.fn() };
  const paidAccess = {
    isSubscriptionGated: vi.fn(),
    isSubscriptionGatedStrict: vi.fn(),
  };
  const logger = { error: vi.fn(), log: vi.fn() };
  const http = { get: vi.fn(), post: vi.fn() };
  const transactionClient = {
    organizationSetting: { findFirst: vi.fn(), updateMany: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn(
      async (callback: (tx: typeof transactionClient) => Promise<void>) =>
        callback(transactionClient),
    ),
  };
  // These dependency boundaries intentionally expose only the methods exercised by this suite.
  const service = new ByokService(
    settings as unknown as ConstructorParameters<typeof ByokService>[0],
    paidAccess as unknown as ConstructorParameters<typeof ByokService>[1],
    http as unknown as ConstructorParameters<typeof ByokService>[2],
    logger as unknown as ConstructorParameters<typeof ByokService>[3],
    prisma as unknown as ConstructorParameters<typeof ByokService>[4],
    crunCache as unknown as ConstructorParameters<typeof ByokService>[5],
  );
  const response = (body: unknown) =>
    new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json' },
    });
  const storedOtherKeys = () => ({
    [ByokProvider.REPLICATE]: {
      apiKey: 'encrypted-replicate',
      isEnabled: true,
      provider: ByokProvider.REPLICATE,
    },
    [ByokProvider.OPENAI]: {
      apiKey: 'encrypted-oauth-access',
      apiSecret: 'encrypted-oauth-refresh',
      isEnabled: true,
      provider: ByokProvider.OPENAI,
      authMode: 'oauth',
      oauthAccountId: 'fixture-oauth-account',
    },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    transport.mockReset();
    vi.stubGlobal('fetch', transport);
    paidAccess.isSubscriptionGated.mockResolvedValue(false);
    paidAccess.isSubscriptionGatedStrict.mockResolvedValue(false);
    transactionClient.organizationSetting.findFirst.mockResolvedValue({
      id: 'settings-direct',
      organizationId: 'org-direct',
      updatedAt: new Date('2026-10-02T00:00:00Z'),
      byokKeys: storedOtherKeys(),
    });
    transactionClient.organizationSetting.updateMany.mockResolvedValue({
      count: 1,
    });
    settings.findOne.mockResolvedValue({ byokKeys: storedOtherKeys() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(providers)(
    'validates $provider using exactly one read-only request, including zero-credit accounts',
    async ({ provider, url, headers, body }) => {
      transport.mockImplementation(async () => response(body));
      expect(await service.validateKey(provider, apiKey)).toEqual({
        isValid: true,
      });
      expect(transport).toHaveBeenCalledOnce();
      expect(transport).toHaveBeenCalledWith(
        url,
        expect.objectContaining({ method: 'GET', headers, redirect: 'error' }),
      );
      expect(transport.mock.calls[0][1]?.body).toBeUndefined();
      expect(http.post).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it.each(providers)(
    'rejects malformed $provider metadata, auth/rate/network failures without exposing credentials',
    async ({ provider }) => {
      const failures = [
        response([]),
        new Response(apiKey, { status: 401 }),
        new Response(apiKey, { status: 403 }),
        new Response(apiKey, { status: 429 }),
      ];
      for (const failure of failures) {
        transport.mockResolvedValueOnce(failure);
        const result = await service.validateKey(provider, apiKey);
        expect(result.isValid).toBe(false);
        expect(JSON.stringify(result)).not.toContain(apiKey);
      }
      transport.mockRejectedValueOnce(new Error(apiKey));
      const result = await service.validateKey(provider, apiKey);
      expect(result.isValid).toBe(false);
      expect(JSON.stringify(result)).not.toContain(apiKey);
      expect(transport).toHaveBeenCalledTimes(5);
      expect(http.post).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it('rejects blocked or unverified xAI ACLs', async () => {
    for (const body of [
      {
        api_key_blocked: true,
        api_key_disabled: false,
        team_blocked: false,
        acls: ['api-key:model:*', 'api-key:endpoint:*'],
      },
      {
        api_key_blocked: false,
        api_key_disabled: true,
        team_blocked: false,
        acls: ['api-key:model:*', 'api-key:endpoint:*'],
      },
      {
        api_key_blocked: false,
        api_key_disabled: false,
        team_blocked: true,
        acls: ['api-key:model:*', 'api-key:endpoint:*'],
      },
      {
        api_key_blocked: false,
        api_key_disabled: false,
        team_blocked: false,
        acls: ['api-key:model:unreviewed'],
      },
    ]) {
      transport.mockResolvedValueOnce(response(body));
      expect(
        (await service.validateKey(ByokProvider.XAI, apiKey)).isValid,
      ).toBe(false);
    }
  });

  it.each(providers)(
    'rejects missing $provider keys before any request',
    async ({ provider }) => {
      expect((await service.validateKey(provider, '')).isValid).toBe(false);
      expect(transport).not.toHaveBeenCalled();
    },
  );

  it.each(providers)(
    'saves and replaces only the validated encrypted $provider key, preserving other keys and OpenAI OAuth',
    async ({ provider, body }) => {
      transport.mockImplementation(async () => response(body));
      await service.saveKey('org-direct', provider, apiKey);
      expect(EncryptionUtil.encrypt).toHaveBeenCalledWith(apiKey);
      expect(
        transactionClient.organizationSetting.findFirst,
      ).toHaveBeenCalledWith({ where: { organizationId: 'org-direct' } });
      expect(
        transactionClient.organizationSetting.updateMany,
      ).toHaveBeenLastCalledWith({
        where: {
          id: 'settings-direct',
          organizationId: 'org-direct',
          updatedAt: new Date('2026-10-02T00:00:00Z'),
        },
        data: {
          isByokEnabled: true,
          byokKeys: expect.objectContaining({
            ...storedOtherKeys(),
            [provider]: expect.objectContaining({
              provider,
              apiKey: `encrypted:${apiKey}`,
              isEnabled: true,
            }),
          }),
        },
      });
      await service.saveKey('org-direct', provider, 'fixture-replacement');
      expect(
        transactionClient.organizationSetting.updateMany,
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            byokKeys: expect.objectContaining({
              ...storedOtherKeys(),
              [provider]: expect.objectContaining({
                apiKey: 'encrypted:fixture-replacement',
              }),
            }),
          }),
        }),
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    },
  );

  it.each(providers)(
    'does not open a storage transaction for a denied $provider credential',
    async ({ provider }) => {
      transport.mockResolvedValue(new Response(apiKey, { status: 403 }));
      await expect(
        service.saveKey('org-direct', provider, apiKey),
      ).rejects.toThrow();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(EncryptionUtil.encrypt).not.toHaveBeenCalled();
    },
  );

  it.each(providers)(
    'keeps $provider storage and lookup behind the existing subscription gate',
    async ({ provider }) => {
      paidAccess.isSubscriptionGated.mockResolvedValue(true);
      paidAccess.isSubscriptionGatedStrict.mockResolvedValue(true);
      await expect(
        service.saveKey('org-direct', provider, apiKey),
      ).rejects.toBeInstanceOf(ForbiddenException);
      settings.findOne.mockResolvedValue({
        byokKeys: {
          [provider]: { apiKey: 'encrypted-direct', isEnabled: true, provider },
        },
      });
      expect(
        await service.lookupApiKey('org-direct', provider),
      ).toBeUndefined();
      expect(transport).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(EncryptionUtil.decrypt).not.toHaveBeenCalled();
    },
  );

  it.each(providers)(
    'reports masked $provider status and exact chrome without OAuth/secret flags',
    async ({ provider, label, docsUrl }) => {
      settings.findOne.mockResolvedValue({
        byokKeys: {
          ...storedOtherKeys(),
          [provider]: { apiKey: 'encrypted-direct', isEnabled: true, provider },
        },
      });
      const statuses = await service.getStatus('org-direct');
      expect(statuses).toHaveLength(18);
      expect(
        statuses.find((status) => status.provider === provider),
      ).toMatchObject({
        label,
        docsUrl,
        description: '',
        hasKey: true,
        isEnabled: true,
        supportsOAuth: undefined,
        requiresSecret: undefined,
        maskedKey: expect.stringContaining('*'),
      });
      expect(
        statuses.find((status) => status.provider === ByokProvider.OPENAI),
      ).toMatchObject({ supportsOAuth: true, authMode: 'oauth' });
      expect(JSON.stringify(statuses)).not.toContain(
        'decrypted:encrypted-direct',
      );
      expect(JSON.stringify(statuses)).not.toContain('encrypted-oauth-refresh');
      expect(settings.findOne).toHaveBeenCalledWith({
        organizationId: 'org-direct',
      });
    },
  );

  it.each(providers)(
    'removes only $provider from the scoped tenant settings',
    async ({ provider }) => {
      transactionClient.organizationSetting.findFirst.mockResolvedValue({
        id: 'settings-direct',
        organizationId: 'org-direct',
        updatedAt: new Date('2026-10-02T00:00:00Z'),
        byokKeys: {
          ...storedOtherKeys(),
          [provider]: { apiKey: 'encrypted-direct', isEnabled: true, provider },
        },
      });
      await service.removeKey('org-direct', provider);
      expect(
        transactionClient.organizationSetting.findFirst,
      ).toHaveBeenCalledWith({ where: { organizationId: 'org-direct' } });
      expect(
        transactionClient.organizationSetting.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          id: 'settings-direct',
          organizationId: 'org-direct',
          updatedAt: new Date('2026-10-02T00:00:00Z'),
        },
        data: { byokKeys: storedOtherKeys(), isByokEnabled: true },
      });
      expect(transport).not.toHaveBeenCalled();
    },
  );

  it('preserves encrypted OpenAI OAuth storage without a credential probe', async () => {
    const entry = {
      apiKey: 'encrypted-oauth-access',
      apiSecret: 'encrypted-oauth-refresh',
      isEnabled: true,
      provider: ByokProvider.OPENAI,
      authMode: 'oauth' as const,
      oauthAccountId: 'fixture-oauth-account',
    };
    transactionClient.organizationSetting.findFirst.mockResolvedValue({
      id: 'settings-direct',
      organizationId: 'org-direct',
      updatedAt: new Date('2026-10-02T00:00:00Z'),
      byokKeys: {
        [ByokProvider.GOOGLE]: {
          apiKey: 'encrypted-direct',
          isEnabled: true,
          provider: ByokProvider.GOOGLE,
        },
      },
    });
    await service.saveOAuthKey('org-direct', ByokProvider.OPENAI, entry);
    expect(
      transactionClient.organizationSetting.updateMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          isByokEnabled: true,
          byokKeys: {
            [ByokProvider.OPENAI]: entry,
            [ByokProvider.GOOGLE]: {
              apiKey: 'encrypted-direct',
              isEnabled: true,
              provider: ByokProvider.GOOGLE,
            },
          },
        },
      }),
    );
    expect(EncryptionUtil.encrypt).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  });

  it('preserves existing OpenAI API-key validation', async () => {
    http.get.mockReturnValue(of({ data: [] }));
    expect(await service.validateKey(ByokProvider.OPENAI, apiKey)).toEqual({
      isValid: true,
    });
    expect(http.get).toHaveBeenCalledWith('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('ByokService HeyGen v3 credential validation', () => {
  const http = { get: vi.fn() };
  const service = new ByokService(
    {} as never,
    {} as never,
    http as never,
    { error: vi.fn() } as never,
    {} as never,
    crunCache as never,
  );
  beforeEach(() => vi.clearAllMocks());
  it('validates the account without fetching a catalog or submitting a paid job', async () => {
    http.get.mockReturnValue(of({ data: { data: { id: 'account' } } }));
    await expect(
      service.validateKey(ByokProvider.HEYGEN, 'fixture-key'),
    ).resolves.toEqual({ isValid: true });
    expect(http.get).toHaveBeenCalledWith(
      'https://api.heygen.com/v3/users/me',
      { headers: { 'X-Api-Key': 'fixture-key' }, timeout: 15_000 },
    );
  });
  it('rejects an unauthorized key', async () => {
    http.get.mockReturnValue(throwError(() => new Error('unauthorized')));
    await expect(
      service.validateKey(ByokProvider.HEYGEN, 'fixture-key'),
    ).resolves.toEqual({ isValid: false, error: 'Invalid HeyGen API key' });
  });
});

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

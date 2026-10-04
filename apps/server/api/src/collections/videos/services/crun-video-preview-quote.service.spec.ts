import { CrunVideoPreviewQuoteService } from '@api/collections/videos/services/crun-video-preview-quote.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { billableProfile } from '@api/helpers/utils/credits/model-billable-quote.fixture';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { ModelCategory } from '@genfeedai/contracts';
import {
  getRuntimeMarginMultiplier,
  quoteModelBillablePricing,
} from '@genfeedai/pricing';

const user = { userId: 'user', organizationId: 'org', brandId: 'brand' };
const intent = {
  model: 'crun/kling/v2-5-turbo-pro',
  text: 'Bird',
  brandId: 'brand',
  outputs: 4,
};
function fixture() {
  const input = {
    normalize: vi.fn().mockReturnValue(intent),
    prepare: vi.fn(),
  };
  const quote = { quote: vi.fn() };
  const cache = {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn(),
    getdel: vi.fn(),
  };
  const tasks = {
    isAdmissionEnabled: vi.fn().mockReturnValue(false),
    resolveCredential: vi.fn(),
  };
  const models = { findOne: vi.fn() };
  const prisma = {
    crunGenerationTask: { findMany: vi.fn().mockResolvedValue([]) },
    ingredient: { count: vi.fn().mockResolvedValue(4) },
  };
  const config = { get: vi.fn() };
  const personas = {
    resolveCharacterReferences: vi.fn().mockResolvedValue(undefined),
  };
  const service = new CrunVideoPreviewQuoteService(
    input as never,
    quote as never,
    cache as never,
    tasks as never,
    models as never,
    prisma as never,
    config as never,
    personas as never,
  );
  return {
    personas,
    service,
    input,
    quote,
    cache,
    tasks,
    models,
    prisma,
    config,
  };
}
function rows(hash = quoteSnapshotHash(intent)) {
  return Array.from({ length: 4 }, (_, outputIndex) => ({
    ingredientId: `ingredient-${outputIndex}`,
    modelKey: intent.model,
    endpoint: intent.model.slice(5),
    outputIndex,
    inputMetadata: { intentHash: hash },
  }));
}
describe('Crun frozen quote consumption', () => {
  it('replays every ordered owned output after Redis expiry without admission/provider work', async () => {
    const f = fixture();
    f.prisma.crunGenerationTask.findMany.mockResolvedValue(rows());
    await expect(
      f.service.consume(intent, 'quote', user as never),
    ).resolves.toEqual({
      kind: 'replay',
      ingredientIds: [
        'ingredient-0',
        'ingredient-1',
        'ingredient-2',
        'ingredient-3',
      ],
    });
    expect(f.cache.get).not.toHaveBeenCalled();
    expect(f.tasks.isAdmissionEnabled).not.toHaveBeenCalled();
    expect(f.input.prepare).not.toHaveBeenCalled();
    expect(f.quote.quote).not.toHaveBeenCalled();
    expect(f.prisma.crunGenerationTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'org',
          userId: 'user',
          brandId: 'brand',
          quoteId: 'quote',
          isDeleted: false,
        },
      }),
    );
  });
  it.each(['different', undefined])(
    'denies mismatching or legacy absent durable intent hash: %s',
    async (hash) => {
      const f = fixture();
      const records = rows();
      records[0].inputMetadata.intentHash = hash as string;
      f.prisma.crunGenerationTask.findMany.mockResolvedValue(records);
      await expect(
        f.service.consume(intent, 'quote', user as never),
      ).rejects.toMatchObject({ response: { code: 'CRUN_QUOTE_STALE' } });
      expect(f.cache.get).not.toHaveBeenCalled();
    },
  );
  it('returns in-progress for partial durable rows rather than consuming again', async () => {
    const f = fixture();
    f.prisma.crunGenerationTask.findMany.mockResolvedValue(rows().slice(0, 3));
    await expect(
      f.service.consume(intent, 'quote', user as never),
    ).rejects.toMatchObject({ response: { code: 'CRUN_QUOTE_IN_PROGRESS' } });
    expect(f.cache.getdel).not.toHaveBeenCalled();
  });
  it('denies replay when an output is no longer authorized', async () => {
    const f = fixture();
    f.prisma.crunGenerationTask.findMany.mockResolvedValue(rows());
    f.prisma.ingredient.count.mockResolvedValue(3);
    await expect(
      f.service.consume(intent, 'quote', user as never),
    ).rejects.toMatchObject({ response: { code: 'CRUN_QUOTE_STALE' } });
  });
  it('distinguishes a consumed token without durable rows from an expired token', async () => {
    const f = fixture();
    f.cache.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ intentHash: quoteSnapshotHash(intent) });
    await expect(
      f.service.consume(intent, 'quote', user as never),
    ).rejects.toMatchObject({ response: { code: 'CRUN_QUOTE_IN_PROGRESS' } });
    await expect(
      f.service.consume(intent, 'quote', user as never),
    ).rejects.toMatchObject({ response: { code: 'CRUN_QUOTE_STALE' } });
    expect(f.cache.getdel).not.toHaveBeenCalled();
  });
});

describe('Crun scoped video preview freshness', () => {
  function fresh() {
    const f = fixture();
    const priced = quoteModelBillablePricing(
      billableProfile({ key: intent.model, provider: 'crun', cost: 3 }),
      { modelKey: intent.model, provider: 'crun', outputs: 4, requests: 4 },
      getRuntimeMarginMultiplier(),
      new Date().toISOString(),
    );
    if (priced.status !== 'priced')
      throw new Error('Fixture pricing unavailable');
    const snapshot = {
      ...priced.snapshot,
      providerQuote: {
        provider: 'crun',
        estimated: false,
        providerCreditsPerTask: '42',
        quoteHash: 'a'.repeat(64),
        inputHash: 'b'.repeat(64),
        contractVersion: 'reviewed',
        creditsPerUsd: '1000',
        acquisitionRateVersion: 'rate',
        credentialSource: 'hosted',
        credentialId: null,
        credentialFingerprint: 'c'.repeat(64),
      },
    };
    const credential = {
      credentialSource: 'hosted',
      credentialId: null,
      credentialFingerprint: 'c'.repeat(64),
    };
    f.input.prepare.mockResolvedValue({
      isAvailable: true,
      data: {
        intent,
        intentHash: quoteSnapshotHash(intent),
        brandId: 'brand',
        preparation: {
          request: {
            model: intent.model.slice(5),
            input: { prompt: 'private prompt' },
          },
          credential,
          contract: { version: 'reviewed' },
        },
      },
    });
    f.quote.quote.mockResolvedValue({ isAvailable: true, snapshot });
    f.cache.set.mockResolvedValue(true);
    f.tasks.isAdmissionEnabled.mockReturnValue(true);
    f.tasks.resolveCredential.mockResolvedValue(credential);
    f.models.findOne.mockResolvedValue({
      isActive: true,
      isDeleted: false,
      provider: 'crun',
      category: ModelCategory.VIDEO,
      reviewedProviderContractVersion: 'reviewed',
      pendingProviderContractVersion: null,
    });
    f.config.get.mockImplementation((key: string) =>
      key === 'CRUN_CREDITS_PER_USD' ? '1000' : 'rate',
    );
    return f;
  }
  it('stores a scope-bound video quote for exactly 60 seconds and atomically consumes once', async () => {
    const f = fresh();
    const now = new Date('2026-10-01T12:00:00Z');
    const response = await f.service.preview(intent, user as never, now);
    expect(response).toMatchObject({
      isAvailable: true,
      expiresAt: '2026-10-01T12:01:00.000Z',
      billingMode: 'credits',
    });
    const [key, captured] = f.cache.set.mock.calls[0];
    expect(key).toBe(`crun:video:quote:org:user:${response.quoteId}`);
    expect(f.cache.set.mock.calls[0][2]).toEqual({ ttl: 60 });
    f.cache.get.mockResolvedValue(captured);
    f.cache.getdel.mockResolvedValueOnce(captured).mockResolvedValueOnce(null);
    await expect(
      f.service.consume(intent, response.quoteId as string, user as never, now),
    ).resolves.toMatchObject({ kind: 'fresh', quote: captured });
    expect(f.cache.set).toHaveBeenLastCalledWith(
      `${key}:consumed`,
      { intentHash: quoteSnapshotHash(intent) },
      { ttl: 60 },
    );
    await expect(
      f.service.consume(intent, response.quoteId as string, user as never, now),
    ).rejects.toMatchObject({ response: { code: 'CRUN_QUOTE_IN_PROGRESS' } });
  });
  it.each([
    'disabled',
    'category',
    'pending',
    'credential',
    'rate',
    'expiry',
    'scope',
  ])(
    'rejects stale %s before token consumption or dispatch',
    async (reason) => {
      const f = fresh();
      const now = new Date('2026-10-01T12:00:00Z');
      const response = await f.service.preview(intent, user as never, now);
      const captured = f.cache.set.mock.calls[0][1];
      f.cache.get.mockResolvedValue(captured);
      if (reason === 'disabled')
        f.tasks.isAdmissionEnabled.mockReturnValue(false);
      if (reason === 'category')
        f.models.findOne.mockResolvedValue({ category: ModelCategory.IMAGE });
      if (reason === 'pending')
        f.models.findOne.mockResolvedValue({
          pendingProviderContractVersion: 'new',
        });
      if (reason === 'credential')
        f.tasks.resolveCredential.mockResolvedValue({
          credentialSource: 'hosted',
          credentialId: null,
          credentialFingerprint: 'd'.repeat(64),
        });
      if (reason === 'rate') f.config.get.mockReturnValue('changed');
      await expect(
        f.service.consume(
          intent,
          response.quoteId as string,
          (reason === 'scope'
            ? { ...user, organizationId: 'foreign' }
            : user) as never,
          reason === 'expiry' ? new Date(now.getTime() + 60000) : now,
        ),
      ).rejects.toMatchObject({ response: { code: 'CRUN_QUOTE_STALE' } });
      expect(f.cache.getdel).not.toHaveBeenCalled();
      expect(f.quote.quote).toHaveBeenCalledTimes(1);
    },
  );
});

describe('Crun quote character admission on consume (#6040)', () => {
  it('re-admits the quoted characters and refuses once access was revoked', async () => {
    const f = fixture();
    f.tasks.isAdmissionEnabled.mockReturnValue(true);
    f.personas.resolveCharacterReferences.mockRejectedValue(
      new NotFoundException('Reference image'),
    );
    const captured = {
      brandId: 'brand',
      intent: { ...intent, references: ['avatar-1'] },
      organizationId: 'org',
      snapshot: { providerQuote: {} },
    };

    await expect(
      f.service.assertCurrent(captured as never),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(f.personas.resolveCharacterReferences).toHaveBeenCalledWith({
      brandId: 'brand',
      ingredientIds: ['avatar-1'],
      organizationId: 'org',
      path: 'video',
    });
    expect(f.models.findOne).not.toHaveBeenCalled();
  });
});

import { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import { BrandFromUrlService } from '@api/collections/brands/services/brand-from-url.service';
import { AgentBrandContentToolHandler } from '@api/services/agent-orchestrator/tools/agent-brand-content-tool-handler.service';
import { DEFAULT_BRAND_VOICE_ANALYSIS } from '@api/services/knowledge-base/master-prompt-generator.service';
import { buildBrandKitDraftFromBrand } from '@genfeedai/helpers';
import { resolveSafeDestination } from '@libs/security/destination-guard';

vi.mock('@libs/security/destination-guard', () => ({
  resolveSafeDestination: vi.fn(),
}));

const context = { organizationId: 'org-1', userId: 'user-1' };
function harness() {
  const brand = {
    id: 'brand-1',
    label: 'Example',
    slug: 'example',
    agentConfig: {},
  };
  const draft = buildBrandKitDraftFromBrand({
    id: brand.id,
    label: 'Website label',
    description: 'Website description',
  });
  let revision = {
    id: 'revision-1',
    content: draft,
    updatedAt: '2026-10-03T00:00:00Z',
    status: 'DRAFT',
  };
  const scan = { status: 'ready', revisionId: revision.id };
  const scrapedData = {
    companyName: 'Example',
    description: 'Example description',
    socialLinks: {},
    valuePropositions: [],
    sourceUrl: 'https://example.com/',
    scrapedAt: new Date(),
  };
  const brands = { create: vi.fn().mockResolvedValue(brand) };
  const scans = {
    startAndCollect: vi.fn().mockResolvedValue({ scan, scrapedData }),
    get: vi.fn().mockImplementation(async () => scan),
  };
  const revisions = {
    get: vi.fn().mockImplementation(async () => revision),
    update: vi.fn().mockImplementation(async (_org, _brand, _id, content) => {
      revision = { ...revision, content, updatedAt: '2026-10-03T00:00:01Z' };
      return revision;
    }),
    approve: vi.fn().mockImplementation(async () => {
      revision = { ...revision, status: 'APPROVED' };
      return revision;
    }),
  };
  const analyzed = {
    tone: 'Bold',
    voice: 'Concise',
    audience: 'Founders',
    values: ['Clarity'],
    messagingPillars: ['Ship'],
    doNotSoundLike: ['Corporate'],
    sampleOutput: 'Ship today.',
    hashtags: [],
    taglines: [],
  };
  const voice = { analyzeBrandVoice: vi.fn().mockResolvedValue(analyzed) };
  const mapper = new BrandDataMapper();
  const persistence = {
    updateBrandGuidance: vi
      .fn()
      .mockImplementation(async (_brand, _org, data) => {
        brand.agentConfig = mapper.mergeExtractedVoice({}, data);
      }),
  };
  const credits = {
    reserveCredits: vi.fn().mockResolvedValue({ id: 'reservation-1' }),
    settleReservation: vi.fn(),
    releaseReservation: vi.fn(),
  };
  const scraper = { validateUrl: vi.fn().mockReturnValue({ isValid: true }) };
  const prisma = {
    brand: { findFirst: vi.fn().mockImplementation(async () => brand) },
    organization: {
      findFirst: vi.fn().mockResolvedValue({ slug: 'example-org' }),
    },
  };
  const config = { get: vi.fn().mockReturnValue('https://app.example.com') };
  const service = new BrandFromUrlService(
    brands as never,
    scans as never,
    revisions as never,
    scraper as never,
    voice as never,
    persistence as never,
    mapper,
    credits as never,
    prisma as never,
    config as never,
  );
  return {
    service,
    brands,
    scans,
    revisions,
    voice,
    persistence,
    credits,
    scraper,
    prisma,
    brand,
    draft,
    analyzed,
  };
}

describe('BrandFromUrlService', () => {
  beforeEach(() => {
    vi.mocked(resolveSafeDestination)
      .mockReset()
      .mockResolvedValue({} as never);
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    'https://example.com/#fragment',
    'https://example.com/#',
    'https://example.com/?token=x',
    'a'.repeat(2049),
    'https://example.com/\u0001',
    'file:///etc/passwd',
  ])('rejects %s before writes', async (url) => {
    const h = harness();
    await expect(h.service.start({ url }, context)).rejects.toThrow(
      'Invalid or blocked URL:',
    );
    expect(h.brands.create).not.toHaveBeenCalled();
    expect(h.credits.reserveCredits).not.toHaveBeenCalled();
  });
  it('hides missing and foreign brands before loading scan state', async () => {
    const h = harness();
    h.prisma.brand.findFirst.mockResolvedValue(null);
    await expect(
      h.service.get(context.organizationId, 'foreign-brand'),
    ).rejects.toThrow('Brand not found.');
    expect(h.prisma.brand.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'foreign-brand',
        organizationId: context.organizationId,
        isDeleted: false,
      },
    });
    expect(h.scans.get).not.toHaveBeenCalled();
  });
  it('rejects a blocked destination before writes', async () => {
    const h = harness();
    vi.mocked(resolveSafeDestination).mockRejectedValue(
      new Error('Private address'),
    );
    await expect(
      h.service.start({ url: 'https://example.com' }, context),
    ).rejects.toThrow('Invalid or blocked URL: Private address');
    expect(h.brands.create).not.toHaveBeenCalled();
    expect(h.credits.reserveCredits).not.toHaveBeenCalled();
  });
  it('bounds DNS preflight at eight seconds with no writes', async () => {
    vi.useFakeTimers();
    const h = harness();
    vi.mocked(resolveSafeDestination).mockReturnValue(new Promise(() => {}));
    const operation = h.service.start({ url: 'https://example.com' }, context);
    const rejection = expect(operation).rejects.toThrow(
      'Invalid or blocked URL: URL check timed out',
    );
    await vi.advanceTimersByTimeAsync(8000);
    await rejection;
    expect(h.brands.create).not.toHaveBeenCalled();
    expect(h.credits.reserveCredits).not.toHaveBeenCalled();
  });
  it('enriches only seven voice fields, writes brand voice and settles one credit', async () => {
    const h = harness();
    const operation = await h.service.start(
      { url: 'https://example.com' },
      context,
    );
    const result = await operation.completion;
    expect(result).toMatchObject({
      brandId: 'brand-1',
      revisionId: 'revision-1',
      revisionStatus: 'draft',
      scanStatus: 'succeeded',
      reviewUrl:
        'https://app.example.com/example-org/example/settings/brand-kit',
    });
    expect(h.brands.create).toHaveBeenCalledWith({
      organizationId: 'org-1',
      userId: 'user-1',
      label: 'example.com',
      backgroundColor: '#000000',
      fontFamily: 'montserrat_black',
      primaryColor: '#000000',
      secondaryColor: '#FFFFFF',
    });
    expect(h.credits.reserveCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1,
        idempotencyKey: expect.stringMatching(/^brand-from-url:/),
      }),
    );
    expect(h.voice.analyzeBrandVoice).toHaveBeenCalledWith(
      expect.objectContaining({ companyName: 'Example' }),
    );
    const content = h.revisions.update.mock.calls[0][3];
    const expected = buildBrandKitDraftFromBrand({
      id: h.brand.id,
      agentConfig: h.brand.agentConfig,
    });
    const voiceKeys = [
      'voiceTone',
      'voiceStyle',
      'voiceAudience',
      'voiceValues',
      'voiceMessagingPillars',
      'voiceDoNotSoundLike',
      'voiceSampleOutput',
    ];
    for (const [key, field] of Object.entries(content.fields)) {
      expect(field).toEqual(
        voiceKeys.includes(key)
          ? Reflect.get(expected.fields, key)
          : Reflect.get(h.draft.fields, key),
      );
    }
    expect(h.revisions.approve).not.toHaveBeenCalled();
    expect(h.credits.settleReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        actualAmount: 1,
        reservationId: 'reservation-1',
      }),
    );
  });
  it('approves the enriched revision with its updated timestamp', async () => {
    const h = harness();
    const operation = await h.service.start(
      { url: 'https://example.com', approve: true },
      context,
    );
    expect(await operation.completion).toMatchObject({
      revisionStatus: 'approved',
    });
    expect(h.revisions.approve).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      'revision-1',
      'user-1',
      '2026-10-03T00:00:01Z',
    );
  });
  it('skips writes on generator fallback', async () => {
    const h = harness();
    h.voice.analyzeBrandVoice.mockResolvedValue(
      DEFAULT_BRAND_VOICE_ANALYSIS as never,
    );
    const operation = await h.service.start(
      { url: 'https://example.com' },
      context,
    );
    expect(await operation.completion).toMatchObject({
      voiceAnalysis: 'unavailable',
    });
    expect(h.persistence.updateBrandGuidance).not.toHaveBeenCalled();
    expect(h.revisions.update).not.toHaveBeenCalled();
  });
  it('skips analysis when scrape data is unavailable', async () => {
    const h = harness();
    h.scans.startAndCollect.mockResolvedValue({
      scan: { status: 'partial', revisionId: 'revision-1' },
      scrapedData: null,
    } as never);
    const operation = await h.service.start(
      { url: 'https://example.com' },
      context,
    );
    expect(await operation.completion).toMatchObject({
      voiceAnalysis: 'unavailable',
    });
    expect(h.voice.analyzeBrandVoice).not.toHaveBeenCalled();
  });
  it('returns running before a delayed scan then exposes the persisted voice revision', async () => {
    vi.useFakeTimers();
    const h = harness();
    const collected = await h.scans.startAndCollect();
    h.scans.startAndCollect.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 21_000));
      h.scans.get.mockResolvedValue(collected.scan);
      return collected;
    });
    h.scans.get.mockResolvedValue({ status: 'running' } as never);
    const handler = new AgentBrandContentToolHandler(
      {} as never,
      {} as never,
      { assertRoles: vi.fn() } as never,
      { hydrate: vi.fn() } as never,
      {
        user: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: context.userId, platformRole: 'USER' }),
        },
      } as never,
      undefined,
      h.service,
    );
    const result = handler.createBrandFromUrl(
      { url: 'https://example.com' },
      context,
    );
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await result).toMatchObject({
      data: { brandId: h.brand.id, scanStatus: 'running' },
      isBillingDelegated: true,
    });
    expect(h.credits.settleReservation).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.revisions.update).toHaveBeenCalledOnce();
    expect(h.credits.settleReservation).toHaveBeenCalledOnce();
    const status = await handler.getBrandScanStatus(
      { brandId: h.brand.id },
      context,
    );
    expect(status).toMatchObject({
      data: {
        scanStatus: 'succeeded',
        revisionId: 'revision-1',
        revisionStatus: 'draft',
      },
      creditsUsed: 0,
    });
    expect(h.brand.agentConfig).toHaveProperty('voice');
  });
  it('releases the reservation when brand creation throws', async () => {
    const h = harness();
    h.brands.create.mockRejectedValue(new Error('create failed'));
    await expect(
      h.service.start({ url: 'https://example.com' }, context),
    ).rejects.toThrow('create failed');
    expect(h.credits.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'reservation-1',
    });
    expect(h.credits.settleReservation).not.toHaveBeenCalled();
  });
  it.each([
    [
      'voice analysis',
      (h: ReturnType<typeof harness>) =>
        h.voice.analyzeBrandVoice.mockRejectedValue(new Error('boom')),
      {},
    ],
    [
      'persistence',
      (h: ReturnType<typeof harness>) =>
        h.persistence.updateBrandGuidance.mockRejectedValue(new Error('boom')),
      {},
    ],
    [
      'a stale revision update',
      (h: ReturnType<typeof harness>) =>
        h.revisions.update.mockRejectedValue(new Error('boom')),
      {},
    ],
    [
      'approval',
      (h: ReturnType<typeof harness>) =>
        h.revisions.approve.mockRejectedValue(new Error('boom')),
      { approve: true },
    ],
  ])(
    'releases the reservation once when %s throws',
    async (_name, arrange, extra) => {
      const h = harness();
      arrange(h);
      const operation = await h.service.start(
        { url: 'https://example.com', ...extra },
        context,
      );
      await expect(operation.completion).rejects.toThrow('boom');
      expect(h.credits.releaseReservation).toHaveBeenCalledOnce();
      expect(h.credits.settleReservation).not.toHaveBeenCalled();
    },
  );
  it('settles exactly once and never releases on success', async () => {
    const h = harness();
    const operation = await h.service.start(
      { url: 'https://example.com' },
      context,
    );
    await operation.completion;
    expect(h.credits.settleReservation).toHaveBeenCalledOnce();
    expect(h.credits.releaseReservation).not.toHaveBeenCalled();
  });
  it('releases the reservation on scan failure and keeps the created brand', async () => {
    const h = harness();
    const failed = { status: 'failed', errorCode: 'brand_scan.failed' };
    h.scans.startAndCollect.mockResolvedValue({
      scan: failed,
      scrapedData: null,
    } as never);
    h.scans.get.mockResolvedValue(failed as never);
    const operation = await h.service.start(
      { url: 'https://example.com' },
      context,
    );
    expect(await operation.completion).toMatchObject({
      brandId: 'brand-1',
      scanStatus: 'failed',
      errorCode: 'brand_scan.failed',
    });
    expect(h.brands.create).toHaveBeenCalledOnce();
    expect(h.credits.releaseReservation).toHaveBeenCalledWith({
      organizationId: 'org-1',
      reservationId: 'reservation-1',
    });
    expect(h.credits.settleReservation).not.toHaveBeenCalled();
  });
});

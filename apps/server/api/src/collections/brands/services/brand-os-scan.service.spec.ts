import { randomUUID } from 'node:crypto';
import type { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { BrandOsScanService } from '@api/collections/brands/services/brand-os-scan.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import type { WebsiteBrandScrapeEvidence } from '@api/services/brand-scraper/interfaces/brand-scraper.interfaces';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import {
  type BrandKitSourceBrand,
  buildBrandKitDraftFromBrand,
  buildBrandKitDraftFromWebsiteScrape,
} from '@genfeedai/helpers';
import {
  type Brand,
  type BrandOsRevision,
  BrandOsRevisionStatus,
  type Prisma,
  toPrismaJson,
} from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, ConflictException } from '@nestjs/common';

const ORG = 'scan-org';
const BRAND = 'scan-brand';
const NOW = new Date('2026-10-01T10:00:00.000Z');
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
interface ScanDatabase {
  brand: Brand;
  rows: BrandOsRevision[];
}
function envelope(): WebsiteBrandScrapeEvidence {
  return {
    data: {
      companyName: 'Scraped Acme',
      fontFamily: 'Acme Variable',
      fontCandidates: ['Acme Variable'],
      socialLinks: {},
      valuePropositions: [],
      sourceUrl: 'https://acme.example/',
      scrapedAt: NOW,
    },
    evidence: [
      {
        sourceType: 'website',
        label: 'Stylesheet font declaration',
        url: 'https://cdn.example/a.css',
        excerpt: "font-family:'Acme Variable'",
      },
    ],
    diagnostics: [
      {
        code: 'brand_scrape.font_availability_unknown',
        severity: 'warning',
        message: 'Unknown font availability',
      },
    ],
    fontCandidates: [
      {
        family: 'Acme Variable',
        sourceUrl: 'https://cdn.example/a.css',
        weight: '100 900',
        style: 'normal',
        availability: 'unknown',
      },
    ],
  };
}
function storedJson(value: unknown): Prisma.JsonValue {
  // The write normalizer performs a JSON roundtrip, including undefined removal
  // and JSON null normalization; this fixture represents its persisted read value.
  return toPrismaJson(value) as Prisma.JsonValue;
}
function approved(): BrandOsRevision {
  const content = buildBrandKitDraftFromBrand({
    id: BRAND,
    organization: { id: ORG },
    label: 'Owner label',
    description: '',
  });
  content.status = 'accepted';
  if (!content.fields.description)
    throw new Error('Fixture description field missing');
  content.fields.description.currentValue = '';
  content.generationRules = {
    schemaVersion: 1,
    evidence: [],
    facts: [],
    palette: [],
    typography: [],
    mandatory: [],
    avoid: [],
    examples: [],
    assets: [],
  };
  return {
    id: 'approved-A',
    brandId: BRAND,
    organizationId: ORG,
    content: storedJson(content),
    status: BrandOsRevisionStatus.APPROVED,
    version: 1,
    isDeleted: false,
    updatedAt: NOW,
    createdAt: NOW,
    approvedAt: NOW,
    approvedById: null,
    exportSchemaVersion: '1',
    sourcePreviewTokenHash: null,
    generationRulesReviewHash: null,
  };
}
function harness(initial: BrandOsRevision[] = []) {
  const state: ScanDatabase = {
    brand: {
      id: BRAND,
      createdAt: NOW,
      updatedAt: NOW,
      userId: null,
      slug: BRAND,
      isDefault: false,
      scope: 'USER',
      isActive: true,
      isHighlighted: false,
      isFleetEnabled: false,
      referenceImages: [],
      voiceIngredientId: null,
      musicIngredientId: null,
      defaultVideoModel: null,
      isPromptEnhancementEnabled: null,
      defaultImageModel: null,
      defaultImageToVideoModel: null,
      defaultMusicModel: null,
      watermarkText: null,
      watermarkLogoId: null,
      watermarkOpacity: 0.35,
      watermarkPosition: 'bottom-right',
      isSocialHistoryImportEnabled: true,
      organizationId: ORG,
      isDeleted: false,
      label: 'Current Brand',
      description: 'Current description',
      text: null,
      fontFamily: 'MONTSERRAT_BLACK',
      primaryColor: '#123456',
      secondaryColor: '#654321',
      backgroundColor: 'transparent',
      agentConfig: { unrelated: 'retained' },
      brandOsRevisionVersion: initial.length,
    },
    rows: structuredClone(initial),
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: BRAND }]),
    brand: {
      findFirst: vi.fn(async (args: Prisma.BrandFindFirstArgs) =>
        args.where?.id === state.brand.id &&
        args.where.organizationId === state.brand.organizationId &&
        !state.brand.isDeleted
          ? structuredClone(state.brand)
          : null,
      ),
      update: vi.fn(async (args: Prisma.BrandUpdateArgs) => {
        if (args.data.agentConfig !== undefined)
          state.brand.agentConfig = storedJson(args.data.agentConfig);
        if (args.data.brandOsRevisionVersion)
          state.brand.brandOsRevisionVersion++;
        return structuredClone(state.brand);
      }),
    },
    brandOsRevision: {
      findFirst: vi.fn(
        async () =>
          state.rows.find(
            (row) =>
              !row.isDeleted && row.status === BrandOsRevisionStatus.APPROVED,
          ) ?? null,
      ),
      create: vi.fn(async (args: Prisma.BrandOsRevisionCreateArgs) => {
        const data = args.data as Prisma.BrandOsRevisionUncheckedCreateInput;
        const row: BrandOsRevision = {
          ...approved(),
          id: `draft-${state.brand.brandOsRevisionVersion}`,
          version: state.brand.brandOsRevisionVersion,
          content: storedJson(data.content),
          status: BrandOsRevisionStatus.DRAFT,
          approvedAt: null,
        };
        state.rows.push(row);
        return row;
      }),
    },
  };
  let pending = Promise.resolve();
  const prisma = {
    ...tx,
    $transaction: vi.fn(
      (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => {
        const result = pending.then(async () => {
          const before = structuredClone(state);
          try {
            return await callback(tx as unknown as Prisma.TransactionClient);
          } catch (error) {
            Object.assign(state, before);
            throw error;
          }
        });
        pending = result.then(
          () => undefined,
          () => undefined,
        );
        return result;
      },
    ),
  };
  const scraper = {
    scrapeWebsiteWithEvidence: vi.fn().mockResolvedValue(envelope()),
  };
  const revisions = new BrandOsRevisionsService(
    prisma as unknown as PrismaService,
    {} as BrandKitAssetsService,
  );
  const logger = { warn: vi.fn() };
  const service = new BrandOsScanService(
    prisma as unknown as PrismaService,
    scraper as unknown as BrandScraperService,
    revisions,
    logger as unknown as LoggerService,
  );
  const input = {
    organizationId: ORG,
    brandId: BRAND,
    url: 'acme.example',
    requestId: randomUUID(),
  };
  const marker = () =>
    JSON.parse(JSON.stringify(state.brand.agentConfig)).brandOsScan;
  return {
    service,
    revisions,
    scraper,
    prisma,
    tx,
    state,
    input,
    marker,
    logger,
  };
}

describe('BrandOsScanService durable bounded scan', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it('collects scrape evidence and returns null data on request replay', async () => {
    const h = harness();
    const collected = await h.service.startAndCollect(h.input);
    expect(collected.scrapedData).toEqual(envelope().data);
    expect(collected.scan).toEqual(await h.service.get(ORG, BRAND));
    const replay = await h.service.startAndCollect(h.input);
    expect(replay).toEqual({ scan: collected.scan, scrapedData: null });
    expect(h.scraper.scrapeWebsiteWithEvidence).toHaveBeenCalledOnce();
  });

  it('does not initialize revisions on an absent GET and projects terminal state without internals', async () => {
    const h = harness();
    expect(await h.service.get(ORG, BRAND)).toBeNull();
    expect(h.state.rows).toHaveLength(0);
    const result = await h.service.start(h.input);
    expect(result.status).toBe('partial');
    expect(result).not.toHaveProperty('schemaVersion');
    expect(result).not.toHaveProperty('baseline');
    expect(await h.service.get(ORG, BRAND)).toEqual(result);
    expect(h.state.rows[0].status).toBe('DRAFT');
    expect(h.marker().schemaVersion).toBe(1);
    expect(h.marker().baseline).toBeNull();
    expect(h.state.brand.agentConfig).toMatchObject({ unrelated: 'retained' });
    expect(h.scraper.scrapeWebsiteWithEvidence).toHaveBeenCalledWith(
      'https://acme.example/',
      expect.objectContaining({ deadlineAt: expect.any(Number) }),
    );
    const content = h.state.rows[0].content as unknown as IBrandKitDraft;
    expect(content.generationRules).toBeUndefined();
    expect(JSON.stringify(content.evidence)).toContain('100 900');
    expect(content.fields.fontFamily?.proposedValue).toBe('Acme Variable');
    expect(
      content.fields.fontFamily?.diagnostics.map((item) => item.code),
    ).toContain('brand_scrape.font_availability_unknown');
  });
  it.each([
    'token',
    'access_token',
    'secret',
    'signature',
    'credential',
    'password',
    'api_key',
    'apikey',
    'api-key',
    'authorization',
    'X-Amz-Credential',
    'X-Goog-Signature',
    'key',
    'sig',
    'auth',
    'AWSAccessKeyId',
    'GoogleAccessId',
    'KeY',
    'SiG',
    'AuTh',
    '%6bey',
    '%73ig',
    '%61uth',
    'AWSAccessKeyIdSuffix',
    'GoogleAccessIdSuffix',
  ])(
    'rejects decoded secret key %s before any marker/fetch and does not echo its value',
    async (key) => {
      const h = harness();
      const error = await h.service
        .start({
          ...h.input,
          url: `https://acme.example/?safe=1&${key}=hidden-secret&${key}=second-secret`,
        })
        .catch((value) => value);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(JSON.stringify(error.getResponse())).not.toContain(
        'hidden-secret',
      );
      expect(h.prisma.$transaction).not.toHaveBeenCalled();
      expect(h.scraper.scrapeWebsiteWithEvidence).not.toHaveBeenCalled();
      expect(h.tx.brand.update).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['example.com:443/path', 'https://example.com/path'],
    ['localhost:8080', 'https://localhost:8080/'],
    ['[::1]:8080/path', 'https://[::1]:8080/path'],
    ['127.0.0.1:8080/path', 'https://127.0.0.1:8080/path'],
    ['HTTP://acme.example/path', 'http://acme.example/path'],
  ])(
    'normalizes host-port or explicit HTTP input %s without weakening the downstream guard',
    async (url, canonical) => {
      const h = harness();
      const result = await h.service.start({ ...h.input, url });
      expect(result.url).toBe(canonical);
      expect(h.scraper.scrapeWebsiteWithEvidence).toHaveBeenCalledWith(
        canonical,
        expect.any(Object),
      );
    },
  );
  it('persists ready as reviewable DRAFT only when helper readiness and all diagnostics allow it', async () => {
    const h = harness();
    h.state.brand.agentConfig = storedJson({
      voice: { tone: 'direct', style: 'concise' },
    });
    const complete = envelope();
    complete.diagnostics = [];
    Object.assign(complete.data, {
      description: 'Useful description',
      primaryColor: '#123456',
      secondaryColor: '#654321',
      logoUrl: 'https://acme.example/logo.png',
      referenceImageUrls: ['https://acme.example/product.png'],
    });
    h.scraper.scrapeWebsiteWithEvidence.mockResolvedValue(complete);
    expect((await h.service.start(h.input)).status).toBe('ready');
    expect(h.state.rows[0].status).toBe('DRAFT');
  });
  it('accepts ordinary monkey/design/author query keys', async () => {
    const h = harness();
    const scan = await h.service.start({
      ...h.input,
      url: 'https://acme.example/?monkey=1&design=2&author=3',
    });
    expect(scan.url).toContain('monkey=1&design=2&author=3');
  });
  it.each([
    'custom:443',
    'custom://acme.example',
    'file:/tmp/file',
    'javascript:alert(1)',
    'example.com:word/path',
    'example.com:99999/path',
    'ftp://acme.example',
    'https://u:p@acme.example',
    'https://acme.example/#fragment',
    'https://acme.example/#',
    'https://acme.example/\npath',
    'https://[broken',
  ])('rejects invalid URL %s without writes', async (url) => {
    const h = harness();
    await expect(h.service.start({ ...h.input, url })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(h.tx.brand.update).not.toHaveBeenCalled();
  });
  it('validates direct-caller UUID and foreign/deleted scope', async () => {
    const h = harness();
    await expect(
      h.service.start({ ...h.input, requestId: 'bad' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      h.service.start({ ...h.input, organizationId: 'foreign' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    h.state.brand.isDeleted = true;
    await expect(h.service.get(ORG, BRAND)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(h.scraper.scrapeWebsiteWithEvidence).not.toHaveBeenCalled();
  });
  it('deduplicates the current key and rejects changed URL/distinct active ID after preparation commits', async () => {
    const h = harness();
    const fetched = deferred<WebsiteBrandScrapeEvidence>();
    const entered = deferred<void>();
    h.scraper.scrapeWebsiteWithEvidence.mockImplementation(() => {
      entered.resolve();
      return fetched.promise;
    });
    const first = h.service.start(h.input);
    await entered.promise;
    expect((await h.service.start(h.input)).status).toBe('running');
    await expect(
      h.service.start({ ...h.input, url: 'https://other.example' }),
    ).rejects.toThrow('Scan request URL does not match');
    await expect(
      h.service.start({ ...h.input, requestId: randomUUID() }),
    ).rejects.toThrow('Another scan is in progress');
    expect(h.marker().status).toBe('running');
    expect(h.scraper.scrapeWebsiteWithEvidence).toHaveBeenCalledOnce();
    fetched.resolve(envelope());
    await first;
    expect(h.state.rows).toHaveLength(1);
    await h.service.start(h.input);
    expect(h.scraper.scrapeWebsiteWithEvidence).toHaveBeenCalledOnce();
  });
  it('commits overdue expiry before same-ID changed-URL conflict and returns it on identical repeat', async () => {
    const h = harness();
    const fetched = deferred<WebsiteBrandScrapeEvidence>();
    const entered = deferred<void>();
    h.scraper.scrapeWebsiteWithEvidence.mockImplementation(() => {
      entered.resolve();
      return fetched.promise;
    });
    const first = h.service.start(h.input);
    await entered.promise;
    vi.setSystemTime(NOW.getTime() + 60000);
    await expect(
      h.service.start({ ...h.input, url: 'https://other.example' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(h.marker()).toMatchObject({
      status: 'failed',
      errorCode: 'brand_scan.timed_out',
    });
    expect((await h.service.start(h.input)).errorCode).toBe(
      'brand_scan.timed_out',
    );
    fetched.resolve(envelope());
    const late = await first;
    expect(late.errorCode).toBe('brand_scan.timed_out');
    expect(late).not.toHaveProperty('baseline');
    expect(late).not.toHaveProperty('schemaVersion');
    expect(h.state.rows).toHaveLength(0);
  });
  it('allows one replacement after timeout and rejects old completion rather than returning new state', async () => {
    const h = harness();
    const fetched = deferred<WebsiteBrandScrapeEvidence>();
    const entered = deferred<void>();
    h.scraper.scrapeWebsiteWithEvidence.mockImplementationOnce(() => {
      entered.resolve();
      return fetched.promise;
    });
    const first = h.service.start(h.input).catch((error) => error);
    await entered.promise;
    vi.setSystemTime(NOW.getTime() + 60000);
    const next = await h.service.start({ ...h.input, requestId: randomUUID() });
    fetched.resolve(envelope());
    expect(await first).toBeInstanceOf(ConflictException);
    expect(h.marker().id).toBe(next.id);
    expect(h.state.rows).toHaveLength(1);
  });
  it('preserves approved manual/empty values and rules unchanged, without editing approved content', async () => {
    const before = approved();
    const h = harness([before]);
    const scan = await h.service.start(h.input);
    expect(scan.revisionId).toBe('draft-2');
    expect(h.state.rows[0]).toEqual(before);
    const content = h.state.rows[1].content as unknown as IBrandKitDraft;
    expect(content.fields.label?.currentValue).toBe('Owner label');
    expect(content.fields.description?.currentValue).toBe('');
    expect(content.fields.label?.applyActionDefault).toBe('preserve');
    expect(content.generationRules).toEqual(
      (before.content as unknown as IBrandKitDraft).generationRules,
    );
  });
  it('fails an invalid baseline before network and does not strip malformed rules', async () => {
    const before = approved();
    const content = before.content as unknown as Record<string, unknown>;
    content.generationRules = { schemaVersion: 9 };
    before.content = storedJson(content);
    const h = harness([before]);
    expect((await h.service.start(h.input)).errorCode).toBe(
      'brand_scan.invalid_baseline',
    );
    expect(h.scraper.scrapeWebsiteWithEvidence).not.toHaveBeenCalled();
    expect(h.state.rows).toHaveLength(1);
  });
  it('rejects an approval change during fetch with no scan revision', async () => {
    const h = harness([approved()]);
    h.scraper.scrapeWebsiteWithEvidence.mockImplementation(async () => {
      h.state.rows[0].id = 'approved-B';
      return envelope();
    });
    expect((await h.service.start(h.input)).errorCode).toBe(
      'brand_scan.revision_conflict',
    );
    expect(h.state.rows).toHaveLength(1);
  });
  it('does not count a guessed fallback logo alone as useful evidence', async () => {
    const h = harness();
    const empty = envelope();
    empty.data = {
      sourceUrl: 'https://acme.example',
      scrapedAt: NOW,
      logoUrl: 'https://img.logo.dev/acme.example',
      fontCandidates: [],
      valuePropositions: [],
      socialLinks: {},
    };
    h.scraper.scrapeWebsiteWithEvidence.mockResolvedValue(empty);
    expect((await h.service.start(h.input)).errorCode).toBe(
      'brand_scan.no_evidence',
    );
    expect(h.state.rows).toHaveLength(0);
  });
  it('keeps a realistic no-baseline scrape below the projection cap', async () => {
    const h = harness();
    const realistic = envelope();
    realistic.evidence = Array.from({ length: 17 }, (_, index) => ({
      sourceType: 'website' as const,
      label: `Homepage section ${index}`,
      url: 'https://acme.example/',
      excerpt: 'Brand details and product positioning. '.repeat(50),
    }));
    realistic.fontCandidates = Array.from({ length: 16 }, (_, index) => ({
      family: `Acme Font ${index}`,
      sourceUrl: 'https://cdn.example/fonts.css',
      weight: '100 900',
      style: 'normal',
      availability: 'unknown' as const,
    }));
    realistic.data.fontCandidates = realistic.fontCandidates.map(
      (candidate) => candidate.family,
    );
    realistic.data.referenceImageUrls = Array.from(
      { length: 9 },
      (_, index) => `https://acme.example/reference-${index}.png`,
    );
    h.scraper.scrapeWebsiteWithEvidence.mockResolvedValue(realistic);
    const scan = await h.service.start(h.input);
    expect(['ready', 'partial']).toContain(scan.status);
    expect(h.state.rows).toHaveLength(1);
    const content = h.state.rows[0].content as unknown as IBrandKitDraft;
    expect(Buffer.byteLength(JSON.stringify(content), 'utf8')).toBeLessThan(
      100_000,
    );
    expect(
      content.fields.description?.evidence.some(
        (entry) => entry.label === 'Homepage section 0',
      ),
    ).toBe(false);
    expect(
      content.fields.description?.evidence.some(
        (entry) => entry.label === 'Discovered font candidate',
      ),
    ).toBe(false);
    expect(
      content.fields.fontFamily?.evidence.filter(
        (entry) => entry.label === 'Discovered font candidate',
      ),
    ).toHaveLength(16);
    expect(
      content.evidence.filter((entry) =>
        entry.label.startsWith('Homepage section'),
      ),
    ).toHaveLength(17);
  });

  it('rejects oversize normalized UTF8 content without trimming owner content', async () => {
    const h = harness();
    const large = envelope();
    large.evidence = [
      { sourceType: 'website', label: 'Oversize', excerpt: '界'.repeat(90000) },
    ];
    h.scraper.scrapeWebsiteWithEvidence.mockResolvedValue(large);
    expect((await h.service.start(h.input)).errorCode).toBe(
      'brand_scan.content_too_large',
    );
    expect(h.state.rows).toHaveLength(0);
    expect(h.logger.warn).toHaveBeenCalledWith(
      'Brand OS scan failed',
      expect.objectContaining({
        brandId: BRAND,
        organizationId: ORG,
        code: 'brand_scan.content_too_large',
      }),
    );
  });
  it('reports invalid content from a corrupt approved draft without changing it', async () => {
    const before = approved();
    const content = before.content as unknown as IBrandKitDraft;
    content.status = 'ready';
    before.content = storedJson(content);
    const h = harness([before]);
    expect((await h.service.start(h.input)).errorCode).toBe(
      'brand_scan.invalid_content',
    );
    expect(h.state.rows).toHaveLength(1);
  });
  it.each([
    [249995, 250006, false],
    [249989, 250000, true],
  ])(
    'checks actual helper %i bytes as persisted %i bytes before creating a revision',
    async (helperBytes, persistedBytes, accepted) => {
      const h = harness([approved()]);
      const brandId = `brand-${'b'.repeat(41)}`;
      expect(brandId).toHaveLength(47);
      expect(h.input.requestId).toHaveLength(36);
      h.state.brand.id = brandId;
      h.input.brandId = brandId;
      const baselineRow = h.state.rows[0];
      baselineRow.brandId = brandId;
      const baseline = baselineRow.content as unknown as IBrandKitDraft;
      baseline.id = brandId;
      baseline.brandId = brandId;
      baseline.evidence = [
        {
          sourceType: 'manual',
          label: 'Owner byte-boundary padding',
          excerpt: '',
        },
      ];
      const extracted = envelope();
      extracted.evidence = [];
      extracted.diagnostics = [];
      extracted.fontCandidates = [];
      const brand = h.state.brand;
      const source: BrandKitSourceBrand = {
        id: brandId,
        organization: { id: ORG },
        label: brand.label,
        description: brand.description,
        text: brand.text,
        fontFamily: brand.fontFamily,
        primaryColor: brand.primaryColor,
        secondaryColor: brand.secondaryColor,
        backgroundColor: brand.backgroundColor,
      };
      const options = {
        baselineDraft: baseline,
        draftId: h.input.requestId,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      };
      const empty = buildBrandKitDraftFromWebsiteScrape(
        source,
        extracted.data,
        options,
      );
      const paddingBytes =
        helperBytes - Buffer.byteLength(JSON.stringify(empty), 'utf8');
      expect(paddingBytes).toBeGreaterThan(0);
      const padding =
        '界'.repeat(Math.floor(paddingBytes / 3)) +
        'x'.repeat(paddingBytes % 3);
      baseline.evidence[0].excerpt = padding;
      baselineRow.content = storedJson(baseline);
      const before = structuredClone(baselineRow);
      const draft = buildBrandKitDraftFromWebsiteScrape(
        source,
        extracted.data,
        options,
      );
      expect(Buffer.byteLength(JSON.stringify(draft), 'utf8')).toBe(
        helperBytes,
      );
      expect(
        Buffer.byteLength(JSON.stringify({ ...draft, id: brandId }), 'utf8'),
      ).toBe(persistedBytes);
      expect(JSON.stringify(draft).length).toBeLessThan(helperBytes);
      h.scraper.scrapeWebsiteWithEvidence.mockResolvedValue(extracted);
      const create = vi.spyOn(h.revisions, 'create');
      const result = await h.service.start(h.input);
      expect(h.state.rows[0]).toEqual(before);
      if (accepted) {
        expect(result.status).toBe('partial');
        expect(create).toHaveBeenCalledOnce();
        expect(create.mock.calls[0][2].id).toBe(h.input.requestId);
        expect(h.state.rows).toHaveLength(2);
        expect(h.state.brand.brandOsRevisionVersion).toBe(2);
        expect(
          Buffer.byteLength(JSON.stringify(h.state.rows[1].content), 'utf8'),
        ).toBe(250000);
      } else {
        expect(result.errorCode).toBe('brand_scan.content_too_large');
        expect(create).not.toHaveBeenCalled();
        expect(h.state.rows).toHaveLength(1);
        expect(h.state.brand.brandOsRevisionVersion).toBe(1);
      }
    },
  );

  it('rejects oversized multibyte owner baseline content without trimming the approved revision', async () => {
    const before = approved();
    const content = before.content as unknown as IBrandKitDraft;
    if (!content.fields.promptGuidelines)
      throw new Error('Fixture guidance field missing');
    content.fields.promptGuidelines.currentValue = '界'.repeat(90000);
    before.content = storedJson(content);
    const h = harness([before]);
    expect((await h.service.start(h.input)).errorCode).toBe(
      'brand_scan.content_too_large',
    );
    expect(h.state.rows).toHaveLength(1);
    expect(h.state.rows[0]).toEqual(before);
    expect(h.state.brand.brandOsRevisionVersion).toBe(1);
  });
  it.each(['replaced', 'deleted', 'active', 'unchanged'])(
    'rechecks an advisory terminal observation under the Brand lock: %s',
    async (outcome) => {
      const h = harness();
      const fetched = deferred<WebsiteBrandScrapeEvidence>();
      const fetchEntered = deferred<void>();
      h.scraper.scrapeWebsiteWithEvidence.mockImplementationOnce(() => {
        fetchEntered.resolve();
        return fetched.promise;
      });
      const pending = h.service.start(h.input).catch((error) => error);
      await fetchEntered.promise;
      vi.setSystemTime(NOW.getTime() + 60000);
      const terminal = await h.service.get(ORG, BRAND);
      const captured = deferred<void>();
      const release = deferred<void>();
      const original = h.tx.brand.findFirst.getMockImplementation();
      h.tx.brand.findFirst.mockImplementationOnce(async (args) => {
        const result = await original?.(args);
        captured.resolve();
        await release.promise;
        return result ?? null;
      });
      fetched.resolve(envelope());
      await captured.promise;
      const writes = h.tx.brand.update.mock.calls.length;
      if (outcome === 'deleted') h.state.brand.isDeleted = true;
      else if (outcome === 'replaced' || outcome === 'active') {
        const prior = h.marker();
        delete prior.completedAt;
        delete prior.errorCode;
        prior.status = 'running';
        prior.startedAt = new Date().toISOString();
        if (outcome === 'replaced') prior.id = randomUUID();
        h.state.brand.agentConfig = storedJson({
          unrelated: 'retained',
          brandOsScan: prior,
        });
      }
      const expected = structuredClone(h.state.brand.agentConfig);
      release.resolve();
      const result = await pending;
      if (outcome === 'unchanged') {
        expect(result).toEqual(terminal);
        expect(result).not.toHaveProperty('baseline');
      } else
        expect(result).toBeInstanceOf(
          outcome === 'deleted' ? NotFoundException : ConflictException,
        );
      expect(h.tx.brand.update).toHaveBeenCalledTimes(writes);
      expect(h.state.rows).toHaveLength(0);
      expect(h.state.brand.agentConfig).toEqual(expected);
    },
  );
  it('records safe failures without leaking underlying error text', async () => {
    const h = harness();
    h.scraper.scrapeWebsiteWithEvidence.mockRejectedValue(
      new Error('credential hidden-secret'),
    );
    const scan = await h.service.start(h.input);
    expect(scan.errorCode).toBe('brand_scan.failed');
    expect(JSON.stringify(h.marker())).not.toContain('hidden-secret');
  });
  it('logs failure diagnostics without website query strings or scraped data', async () => {
    const h = harness();
    h.scraper.scrapeWebsiteWithEvidence.mockRejectedValue(
      new Error('Fetch failed for https://acme.example/?token=hidden-secret'),
    );
    const scan = await h.service.start(h.input);
    expect(scan.status).toBe('failed');
    expect(h.logger.warn).toHaveBeenCalledWith('Brand OS scan failed', {
      brandId: BRAND,
      organizationId: ORG,
      code: 'brand_scan.failed',
      error: 'Fetch failed for [website]',
    });
    expect(JSON.stringify(h.logger.warn.mock.calls)).not.toContain(
      'hidden-secret',
    );
  });

  it('does not reset malformed stored markers', async () => {
    const h = harness();
    h.state.brand.agentConfig = storedJson({
      brandOsScan: { schemaVersion: 7 },
      unrelated: 'retained',
    });
    await expect(h.service.start(h.input)).rejects.toThrow(
      'Scan state is invalid',
    );
    expect(h.tx.brand.update).not.toHaveBeenCalled();
    expect(h.scraper.scrapeWebsiteWithEvidence).not.toHaveBeenCalled();
  });
  it.each(['create', 'marker'])(
    'rolls back revision/version/terminal marker when the deadline crosses during awaited %s',
    async (boundary) => {
      const h = harness();
      if (boundary === 'create') {
        const original = h.tx.brandOsRevision.create.getMockImplementation();
        h.tx.brandOsRevision.create.mockImplementation(async (args) => {
          const result = await original?.(args);
          vi.setSystemTime(NOW.getTime() + 60000);
          return result as BrandOsRevision;
        });
      } else {
        const original = h.tx.brand.update.getMockImplementation();
        h.tx.brand.update.mockImplementation(async (args) => {
          const result = await original?.(args);
          const config = JSON.parse(
            JSON.stringify(args.data.agentConfig ?? {}),
          );
          if (config.brandOsScan?.revisionId)
            vi.setSystemTime(NOW.getTime() + 60000);
          return result as Brand;
        });
      }
      expect((await h.service.start(h.input)).errorCode).toBe(
        'brand_scan.timed_out',
      );
      expect(h.state.rows).toHaveLength(0);
      expect(h.state.brand.brandOsRevisionVersion).toBe(0);
      expect(h.marker().revisionId).toBeUndefined();
    },
  );
});

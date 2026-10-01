import { randomUUID } from 'node:crypto';
import type { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { BrandOsScanService } from '@api/collections/brands/services/brand-os-scan.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import type { WebsiteBrandScrapeEvidence } from '@api/services/brand-scraper/interfaces/brand-scraper.interfaces';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import { buildBrandKitDraftFromBrand } from '@genfeedai/helpers';
import { Prisma, PrismaClient, toPrismaJson } from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
const connectionString = process.env.BRAND_ONBOARDING_TEST_DATABASE_URL;
const explicitlyRequested = process.argv.some((argument) =>
  argument.includes('brand-os-scan.postgres.spec.ts'),
);
if (explicitlyRequested && !connectionString)
  throw new Error(
    'BRAND_ONBOARDING_TEST_DATABASE_URL is required for the requested PostgreSQL proof',
  );
interface DatabaseIdentity {
  name: string;
}
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
function evidence(): WebsiteBrandScrapeEvidence {
  return {
    data: {
      companyName: 'Website proposal',
      description: 'Useful description',
      fontFamily: 'Acme Variable',
      fontCandidates: ['Acme Variable'],
      socialLinks: {},
      valuePropositions: [],
      sourceUrl: 'https://acme.example/',
      scrapedAt: new Date(),
    },
    evidence: [
      {
        sourceType: 'website',
        label: 'Website font declaration',
        excerpt: "font-family:'Acme Variable'",
      },
    ],
    diagnostics: [],
    fontCandidates: [
      {
        family: 'Acme Variable',
        sourceUrl: 'https://acme.example/',
        weight: '100 900',
        availability: 'unknown',
      },
    ],
  };
}

describe.skipIf(!connectionString)(
  'BrandOsScanService real isolated PostgreSQL atomicity',
  () => {
    // No connection to DATABASE_URL or any active application database.
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    function database(): PrismaClient {
      if (!prisma)
        throw new Error('BRAND_ONBOARDING_TEST_DATABASE_URL is required');
      return prisma;
    }
    let userId: string;
    let organizationId: string;
    let brandId: string;
    let requestId: string;
    let now: number;
    const scraper = {
      scrapeWebsiteWithEvidence:
        vi.fn<BrandScraperService['scrapeWebsiteWithEvidence']>(),
    };
    function revisions(): BrandOsRevisionsService {
      return new BrandOsRevisionsService(
        database() as unknown as PrismaService,
        {} as BrandKitAssetsService,
      );
    }
    function makeService(revisionService = revisions()): BrandOsScanService {
      return new BrandOsScanService(
        database() as unknown as PrismaService,
        scraper as unknown as BrandScraperService,
        revisionService,
      );
    }
    const input = () => ({
      organizationId,
      brandId,
      requestId,
      url: 'https://acme.example/',
    });
    const scope = () => ({ organizationId, brandId, isDeleted: false });
    async function scanRows() {
      return database().brandOsRevision.findMany({
        where: scope(),
        orderBy: { version: 'asc' },
      });
    }
    async function currentMarker() {
      const brand = await database().brand.findFirstOrThrow({
        where: { id: brandId, organizationId },
      });
      return JSON.parse(JSON.stringify(brand.agentConfig)).brandOsScan;
    }
    async function approvedA(): Promise<IBrandKitDraft> {
      const content = buildBrandKitDraftFromBrand({
        id: brandId,
        organization: { id: organizationId },
        label: 'Owner label',
        description: 'Manual description',
      });
      content.status = 'accepted';
      if (!content.fields.description)
        throw new Error('Fixture description field missing');
      content.fields.description.currentValue = '';
      delete content.fields.promptGuidelines?.currentValue;
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
      await database().brandOsRevision.create({
        data: {
          brandId,
          organizationId,
          version: 1,
          status: 'APPROVED',
          content: toPrismaJson(content),
        },
      });
      await database().brand.update({
        where: { id: brandId, organizationId },
        data: { brandOsRevisionVersion: 1 },
      });
      return content;
    }
    beforeEach(async () => {
      if (!connectionString)
        throw new Error('BRAND_ONBOARDING_TEST_DATABASE_URL is required');
      if (new URL(connectionString).pathname !== '/brand_onboarding_5785')
        throw new Error('Scan proof requires database brand_onboarding_5785');
      const db = database();
      const names = await db.$queryRaw<DatabaseIdentity[]>(
        Prisma.sql`SELECT current_database() AS name`,
      );
      expect(names[0]?.name).toBe('brand_onboarding_5785'); // Before any fixture mutation.
      vi.clearAllMocks();
      now = Date.now();
      // Capture durable timestamp via Date construction as well as Date.now.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(now);
      const suffix = randomUUID();
      userId = `scan-user-${suffix}`;
      organizationId = `scan-org-${suffix}`;
      brandId = `scan-brand-${suffix}`;
      requestId = randomUUID();
      await db.user.create({ data: { id: userId, handle: userId } });
      await db.organization.create({
        data: {
          id: organizationId,
          label: organizationId,
          slug: organizationId,
          userId,
        },
      });
      await db.brand.create({
        data: {
          id: brandId,
          label: 'Current Brand',
          slug: brandId,
          organizationId,
          userId,
          agentConfig: { unrelated: 'before' },
        },
      });
      scraper.scrapeWebsiteWithEvidence.mockResolvedValue(evidence());
    });
    afterEach(async () => {
      vi.useRealTimers();
      vi.restoreAllMocks();
      if (!brandId) return;
      const db = database();
      await db.brandOsRevision.deleteMany({
        where: { brandId, organizationId },
      });
      await db.brand.deleteMany({ where: { id: brandId, organizationId } });
      await db.organization.deleteMany({ where: { id: organizationId } });
      await db.user.deleteMany({ where: { id: userId } });
    });
    afterAll(async () => {
      await prisma?.$disconnect();
    });
    function advanceDeadline(): void {
      now += 60000;
      vi.setSystemTime(now);
    }
    function gateScraper() {
      const entered = deferred<void>();
      const release = deferred<WebsiteBrandScrapeEvidence>();
      scraper.scrapeWebsiteWithEvidence.mockImplementationOnce(() => {
        entered.resolve();
        return release.promise;
      });
      return { entered, release };
    }
    it('serializes concurrent same-key callers to one scrape/revision and retrieves it in a fresh session', async () => {
      const gate = gateScraper();
      const first = makeService().start(input());
      await gate.entered.promise;
      const duplicate = await makeService().start(input());
      expect(duplicate.status).toBe('running');
      await expect(
        makeService().start({ ...input(), requestId: randomUUID() }),
      ).rejects.toThrow('Another scan is in progress');
      expect(scraper.scrapeWebsiteWithEvidence).toHaveBeenCalledOnce();
      gate.release.resolve(evidence());
      const terminal = await first;
      expect(terminal.revisionId).toBeTruthy();
      expect(await scanRows()).toHaveLength(1);
      expect(await makeService().get(organizationId, brandId)).toEqual(
        terminal,
      );
      if (!terminal.revisionId)
        throw new Error('Scan draft revision is missing');
      const saved = await revisions().get(
        organizationId,
        brandId,
        terminal.revisionId,
      );
      expect(saved.status).toBe('DRAFT');
      expect(saved.content.fields.fontFamily?.proposedValue).toBe(
        'Acme Variable',
      );
    });
    it('preserves a concurrent unrelated config CAS and approved rules/manual/empty/missing baseline', async () => {
      const baseline = await approvedA();
      const gate = gateScraper();
      const pending = makeService().start(input());
      await gate.entered.promise;
      const db = database();
      const previous = await db.brand.findFirstOrThrow({
        where: { id: brandId, organizationId, isDeleted: false },
      });
      const result = await db.brand.updateMany({
        where: {
          id: brandId,
          organizationId,
          isDeleted: false,
          agentConfig: { equals: previous.agentConfig },
        },
        data: {
          agentConfig: toPrismaJson({
            ...JSON.parse(JSON.stringify(previous.agentConfig)),
            unrelated: 'after',
            newKey: 'retained',
          }),
        },
      });
      expect(result.count).toBe(1);
      gate.release.resolve(evidence());
      await pending;
      const rows = await scanRows();
      expect(rows).toHaveLength(2);
      expect(rows[0].content).toEqual(baseline);
      expect(rows[0].status).toBe('APPROVED');
      expect(rows[1].status).toBe('DRAFT');
      const content = rows[1].content as unknown as IBrandKitDraft;
      expect(content.generationRules).toEqual(baseline.generationRules);
      expect(content.fields.description?.currentValue).toBe('');
      expect(content.fields.promptGuidelines).not.toHaveProperty(
        'currentValue',
      );
      expect(content.fields.label?.currentValue).toBe('Owner label');
      expect(
        (
          await db.brand.findFirstOrThrow({
            where: { id: brandId, organizationId },
          })
        ).agentConfig,
      ).toMatchObject({ unrelated: 'after', newKey: 'retained' });
    });
    it('actual approval during fetching prevents a stale scan draft while retaining both historical revisions', async () => {
      await approvedA();
      const gate = gateScraper();
      const pending = makeService().start(input());
      await gate.entered.promise;
      const content = buildBrandKitDraftFromBrand({
        id: brandId,
        organization: { id: organizationId },
        label: 'Owner B',
      });
      const draft = await revisions().create(organizationId, brandId, content);
      await revisions().approve(
        organizationId,
        brandId,
        draft.id,
        userId,
        draft.updatedAt,
      );
      gate.release.resolve(evidence());
      expect((await pending).errorCode).toBe('brand_scan.revision_conflict');
      const rows = await scanRows();
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.status)).toEqual(['SUPERSEDED', 'APPROVED']);
    });
    it('commits expired same-ID payload conflict and GET timeout before deferred success', async () => {
      const gate = gateScraper();
      const pending = makeService().start(input());
      await gate.entered.promise;
      advanceDeadline();
      await expect(
        makeService().start({ ...input(), url: 'https://other.example/' }),
      ).rejects.toThrow('Scan request URL does not match');
      expect((await currentMarker()).errorCode).toBe('brand_scan.timed_out');
      expect((await makeService().start(input())).errorCode).toBe(
        'brand_scan.timed_out',
      );
      expect(
        (await makeService().get(organizationId, brandId))?.errorCode,
      ).toBe('brand_scan.timed_out');
      gate.release.resolve(evidence());
      expect((await pending).errorCode).toBe('brand_scan.timed_out');
      expect(await scanRows()).toHaveLength(0);
    });
    it('GET itself expires a pending fetch before its deferred successful result', async () => {
      const gate = gateScraper();
      const pending = makeService().start(input());
      await gate.entered.promise;
      try {
        advanceDeadline();
        const expired = await makeService().get(organizationId, brandId);
        expect(expired).toMatchObject({
          status: 'failed',
          errorCode: 'brand_scan.timed_out',
        });
        expect((await currentMarker()).errorCode).toBe('brand_scan.timed_out');
        gate.release.resolve(evidence());
        expect((await pending).errorCode).toBe('brand_scan.timed_out');
        expect(await scanRows()).toHaveLength(0);
      } finally {
        gate.release.resolve(evidence());
        await pending;
      }
    });

    it('a retry after timeout owns the marker and rejects the older completion', async () => {
      const gate = gateScraper();
      const old = makeService()
        .start(input())
        .catch((error) => error);
      await gate.entered.promise;
      advanceDeadline();
      const next = await makeService().start({
        ...input(),
        requestId: randomUUID(),
      });
      gate.release.resolve(evidence());
      expect(await old).toBeInstanceOf(ConflictException);
      expect((await currentMarker()).id).toBe(next.id);
      expect(await scanRows()).toHaveLength(1);
    });
    it.each(['create', 'marker'])(
      'rolls back real draft/version and tentative terminal state after deadline crosses during awaited %s',
      async (boundary) => {
        const writer = revisions();
        if (boundary === 'create') {
          const original = writer.create.bind(writer);
          vi.spyOn(writer, 'create').mockImplementation(async (...args) => {
            const result = await original(...args);
            advanceDeadline();
            return result;
          });
        } else {
          const extended = database().$extends({
            query: {
              brand: {
                async update({ args, query }) {
                  const result = await query(args);
                  const value = JSON.parse(
                    JSON.stringify(args.data.agentConfig ?? {}),
                  );
                  if (value.brandOsScan?.revisionId) advanceDeadline();
                  return result;
                },
              },
            },
          });
          const extendedRevisions = new BrandOsRevisionsService(
            extended as unknown as PrismaService,
            {} as BrandKitAssetsService,
          );
          const service = new BrandOsScanService(
            extended as unknown as PrismaService,
            scraper as unknown as BrandScraperService,
            extendedRevisions,
          );
          expect((await service.start(input())).errorCode).toBe(
            'brand_scan.timed_out',
          );
          expect(await scanRows()).toHaveLength(0);
          expect(
            (
              await database().brand.findFirstOrThrow({
                where: { id: brandId, organizationId },
              })
            ).brandOsRevisionVersion,
          ).toBe(0);
          expect((await currentMarker()).revisionId).toBeUndefined();
          return;
        }
        const terminal = await makeService(writer).start(input());
        expect(terminal.errorCode).toBe('brand_scan.timed_out');
        expect(await scanRows()).toHaveLength(0);
        expect(
          (
            await database().brand.findFirstOrThrow({
              where: { id: brandId, organizationId },
            })
          ).brandOsRevisionVersion,
        ).toBe(0);
        expect((await currentMarker()).revisionId).toBeUndefined();
      },
    );

    it('a real row lock held past deadline prevents success persistence', async () => {
      let observeCompletion = false;
      const attempting = deferred<void>();
      const extended = database().$extends({
        query: {
          $queryRaw: async ({ args, query }) => {
            if (observeCompletion) attempting.resolve();
            return query(args);
          },
        },
      });
      const writer = new BrandOsRevisionsService(
        extended as unknown as PrismaService,
        {} as BrandKitAssetsService,
      );
      const service = new BrandOsScanService(
        extended as unknown as PrismaService,
        scraper as unknown as BrandScraperService,
        writer,
      );
      const gate = gateScraper();
      const pending = service.start(input());
      await gate.entered.promise;
      const locked = deferred<void>();
      const unlock = deferred<void>();
      const holding = database().$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "brands" WHERE "id"=${brandId} AND "organizationId"=${organizationId} AND "isDeleted"=false FOR UPDATE`,
        );
        locked.resolve();
        await unlock.promise;
      });
      try {
        await locked.promise;
        observeCompletion = true;
        gate.release.resolve(evidence());
        await attempting.promise; // Actual completion FOR UPDATE issued while another transaction owns the row.
        advanceDeadline();
        unlock.resolve();
        await holding;
        expect((await pending).errorCode).toBe('brand_scan.timed_out');
        expect(await scanRows()).toHaveLength(0);
      } finally {
        unlock.resolve();
        gate.release.resolve(evidence());
        await holding;
        await pending;
      }
    });
    it.each(['replaced', 'deleted', 'active', 'unchanged'])(
      'gates a real advisory terminal read and rechecks under lock: %s',
      async (outcome) => {
        let observe = false;
        const captured = deferred<void>();
        const releaseRead = deferred<void>();
        const extended = database().$extends({
          query: {
            brand: {
              async findFirst({ args, query }) {
                const row = await query(args);
                if (observe) {
                  observe = false;
                  captured.resolve();
                  await releaseRead.promise;
                }
                return row;
              },
            },
          },
        });
        const writer = new BrandOsRevisionsService(
          extended as unknown as PrismaService,
          {} as BrandKitAssetsService,
        );
        const service = new BrandOsScanService(
          extended as unknown as PrismaService,
          scraper as unknown as BrandScraperService,
          writer,
        );
        const gate = gateScraper();
        const pending = service.start(input()).catch((error) => error);
        await gate.entered.promise;
        advanceDeadline();
        const terminal = await makeService().get(organizationId, brandId);
        try {
          observe = true;
          gate.release.resolve(evidence());
          await captured.promise;
          if (outcome === 'deleted')
            await database().brand.update({
              where: { id: brandId, organizationId },
              data: { isDeleted: true },
            });
          else if (outcome === 'replaced' || outcome === 'active') {
            await database().$transaction(async (tx) => {
              await tx.$queryRaw(
                Prisma.sql`SELECT "id" FROM "brands" WHERE "id"=${brandId} AND "organizationId"=${organizationId} AND "isDeleted"=false FOR UPDATE`,
              );
              const previous = await tx.brand.findFirstOrThrow({
                where: { id: brandId, organizationId, isDeleted: false },
              });
              const config = JSON.parse(JSON.stringify(previous.agentConfig));
              const marker = config.brandOsScan;
              delete marker.completedAt;
              delete marker.errorCode;
              marker.status = 'running';
              marker.startedAt = new Date().toISOString();
              if (outcome === 'replaced') marker.id = randomUUID();
              await tx.brand.update({
                where: { id: brandId, organizationId, isDeleted: false },
                data: { agentConfig: toPrismaJson(config) },
              });
            });
          }
          const expected = await currentMarker();
          releaseRead.resolve();
          const result = await pending;
          if (outcome === 'unchanged') {
            expect(result).toEqual(terminal);
            expect(result).not.toHaveProperty('schemaVersion');
            expect(result).not.toHaveProperty('baseline');
          } else
            expect(result).toBeInstanceOf(
              outcome === 'deleted' ? NotFoundException : ConflictException,
            );
          expect(await currentMarker()).toEqual(expected);
          expect(await scanRows()).toHaveLength(0);
        } finally {
          releaseRead.resolve();
          gate.release.resolve(evidence());
          await pending;
        }
      },
    );

    it('deleted or foreign brands cannot create drafts or change the scan owner', async () => {
      await expect(
        makeService().start({ ...input(), organizationId: 'foreign-org' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(scraper.scrapeWebsiteWithEvidence).not.toHaveBeenCalled();
      const gate = gateScraper();
      const pending = makeService()
        .start(input())
        .catch((error) => error);
      await gate.entered.promise;
      await database().brand.update({
        where: { id: brandId, organizationId },
        data: { isDeleted: true },
      });
      gate.release.resolve(evidence());
      expect(await pending).toBeInstanceOf(NotFoundException);
      expect(await scanRows()).toHaveLength(0);
    });
  },
);

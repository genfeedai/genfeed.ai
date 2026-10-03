import { randomUUID } from 'node:crypto';
import {
  extensionPublicationAnalyticsDiscoveryFilter,
  publicYoutubeInboxPostFilter,
} from '@api/collections/posts/services/post-publication-capture.filters';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { TargetExecutionState } from '@genfeedai/contracts';
import { postExecutionStateReadFilter } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { CredentialPlatform, Prisma, PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
// Provisioning and all migrations belong to the explicitly leased verification setup, never this spec.
const connectionString = process.env.PUBLICATION_CAPTURE_TEST_DATABASE_URL;
if (connectionString !== undefined) {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(
      'PUBLICATION_CAPTURE_TEST_DATABASE_URL must name a disposable local database.',
    );
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/genfeed_4347_disposable')
  )
    throw new Error(
      'PUBLICATION_CAPTURE_TEST_DATABASE_URL must name a disposable local database.',
    );
}
describe.skipIf(!connectionString)(
  'capture predicates on real generated Prisma and PostgreSQL',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    function db() {
      if (!prisma)
        throw new Error('Explicit disposable capture database is required.');
      return prisma;
    }
    const userId = randomUUID();
    const organizationId = randomUUID();
    const brandId = randomUUID();
    const credentialId = randomUUID();
    const foreignOrganizationId = randomUUID();
    const foreignBrandId = randomUUID();
    const foreignCredentialId = randomUUID();
    const due = new Date('2026-01-01T00:00:00Z');
    const cutoff = new Date('2026-01-02T00:00:00Z');
    const future = new Date('2026-02-01T00:00:00Z');
    const ids = new Map<string, string>();
    const analyticsExpected: string[] = [];
    const publicExpected: string[] = [];
    let token = 0;
    async function add(
      name: string,
      settings: Prisma.InputJsonValue | typeof Prisma.JsonNull,
      options: {
        source?: string | null;
        enabled?: boolean;
        visibility?: string | null;
        deleted?: boolean;
        foreign?: boolean;
        future?: boolean;
        publishedAt?: Date;
        analytics?: boolean;
        publicInbox?: boolean;
      } = {},
    ) {
      const id = randomUUID();
      ids.set(name, id);
      await db().post.create({
        data: {
          id,
          userId,
          organizationId: options.foreign
            ? foreignOrganizationId
            : organizationId,
          brandId: options.foreign ? foreignBrandId : brandId,
          credentialId: options.foreign ? foreignCredentialId : credentialId,
          description: `capture fixture ${name}`,
          platform: 'youtube',
          externalId: `V${String(++token).padStart(10, '0')}`,
          source: options.source === undefined ? 'extension' : options.source,
          status: 'public',
          targetExecutionState: TargetExecutionState.PUBLISHED,
          targetSettings: settings,
          isAnalyticsEnabled: options.enabled ?? true,
          visibility: options.visibility ?? null,
          isDeleted: options.deleted ?? false,
          analyticsNextCollectAt: options.future ? future : due,
          publishedAt: options.publishedAt ?? due,
        },
      });
      if (options.analytics) analyticsExpected.push(id);
      if (options.publicInbox) publicExpected.push(id);
      return id;
    }
    beforeAll(async () => {
      await db().user.create({
        data: { id: userId, handle: `capture-${userId}` },
      });
      for (const [org, brand, credential] of [
        [organizationId, brandId, credentialId],
        [foreignOrganizationId, foreignBrandId, foreignCredentialId],
      ]) {
        await db().organization.create({
          data: {
            id: org,
            userId,
            label: 'Capture fixture',
            slug: `capture-${org}`,
          },
        });
        await db().brand.create({
          data: {
            id: brand,
            userId,
            organizationId: org,
            label: 'Capture fixture',
            slug: `capture-${brand}`,
          },
        });
        await db().credential.create({
          data: {
            id: credential,
            userId,
            organizationId: org,
            brandId: brand,
            platform: CredentialPlatform.YOUTUBE,
            isConnected: true,
          },
        });
      }
      // Post.targetSettings is nonnullable JSON: SQL NULL is not legal and is never manufactured.
      // JSON null and every absent/null nested path are separate legal fixtures.
      const legacy: Array<
        [string, Prisma.InputJsonValue | typeof Prisma.JsonNull]
      > = [
        ['json-null', Prisma.JsonNull],
        ['empty-object', {}],
        ['capture-null', { extensionCapture: null }],
        ['capture-empty', { extensionCapture: {} }],
        ['version-null', { extensionCapture: { version: null } }],
        ['version-zero', { extensionCapture: { version: 0 } }],
        ['version-two', { extensionCapture: { version: 2 } }],
      ];
      for (const [name, settings] of legacy)
        await add(name, settings, {
          enabled: false,
          analytics: true,
          publicInbox: true,
        });
      for (const source of [null, 'manual'])
        await add(
          `source-${source}`,
          { extensionCapture: { version: 1 } },
          { source, enabled: false, analytics: true, publicInbox: true },
        );
      await add(
        'v1-disabled',
        { extensionCapture: { version: 1, publicationKind: 'post' } },
        { enabled: false, visibility: 'private' },
      );
      await add(
        'v1-public-post',
        { extensionCapture: { version: 1, publicationKind: 'post' } },
        { visibility: 'public', analytics: true, publicInbox: true },
      );
      for (const visibility of [null, 'private', 'unlisted'])
        await add(
          `v1-visibility-${visibility}`,
          { extensionCapture: { version: 1, publicationKind: 'post' } },
          { visibility, analytics: true },
        );
      await add(
        'v1-public-reply',
        { extensionCapture: { version: 1, publicationKind: 'reply' } },
        { visibility: 'public', analytics: true },
      );
      await add(
        'v1-missing-kind',
        { extensionCapture: { version: 1 } },
        { visibility: 'public', analytics: true },
      );
      await add('foreign', {}, { foreign: true });
      await add('deleted', {}, { deleted: true });
      await add('future', {}, { future: true });
      for (let i = 0; i < 21; i++)
        await add(
          `new-ineligible-${i}`,
          { extensionCapture: { version: 1, publicationKind: 'reply' } },
          {
            enabled: false,
            visibility: null,
            publishedAt: new Date('2026-01-04T00:00:00Z'),
          },
        );
      await add(
        'older-eligible',
        { extensionCapture: { version: 1, publicationKind: 'post' } },
        {
          visibility: 'public',
          publishedAt: new Date('2025-12-01T00:00:00Z'),
          analytics: true,
          publicInbox: true,
        },
      );
    });
    afterAll(async () => {
      try {
        for (const org of [organizationId, foreignOrganizationId]) {
          await db().post.deleteMany({
            where: {
              organizationId: org,
              userId,
              id: { in: [...ids.values()] },
            },
          });
          await db().credential.deleteMany({
            where: {
              organizationId: org,
              userId,
              id: { in: [credentialId, foreignCredentialId] },
            },
          });
          await db().brand.deleteMany({
            where: {
              organizationId: org,
              userId,
              id: { in: [brandId, foreignBrandId] },
            },
          });
          await db().organization.deleteMany({ where: { id: org, userId } });
        }
        await db().user.deleteMany({ where: { id: userId } });
      } finally {
        await prisma?.$disconnect();
      }
    });
    const discoveryWhere = (postId?: string) =>
      scopedWhere(organizationId, {
        externalId: { not: null },
        AND: [extensionPublicationAnalyticsDiscoveryFilter()],
        platform: 'youtube',
        ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
        ...(postId
          ? { id: postId }
          : { analyticsNextCollectAt: { lte: cutoff } }),
      });
    it('matches the frozen due-date legacy/capture matrix and excludes foreign/deleted rows', async () => {
      const posts = await db().post.findMany({
        where: discoveryWhere(),
        orderBy: [{ analyticsNextCollectAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
      });
      expect(posts.map((row) => row.id).sort()).toEqual(
        [...analyticsExpected].sort(),
      );
    });
    it('preserves exact postId discovery without due-date relaxation of capture eligibility', async () => {
      for (const name of ['future', 'v1-disabled', 'foreign', 'deleted']) {
        const postId = ids.get(name);
        if (!postId) throw new Error(`Missing ${name}`);
        expect(
          (
            await db().post.findMany({
              where: discoveryWhere(postId),
              select: { id: true },
            })
          ).map((row) => row.id),
        ).toEqual(name === 'future' ? [postId] : []);
      }
    });
    it('applies public captured-post eligibility before take20 so newer ineligible rows cannot starve it', async () => {
      const posts = await db().post.findMany({
        where: scopedWhere(
          organizationId,
          publicYoutubeInboxPostFilter({ id: credentialId, brandId }),
        ),
        take: 20,
        orderBy: { publishedAt: 'desc' },
        select: { id: true },
      });
      // The future legacy row is still a legitimate public-inbox row: that consumer has no analytics due-date predicate.
      const expected = [...publicExpected, ids.get('future')];
      expect(posts.map((row) => row.id).sort()).toEqual(expected.sort());
      expect(posts.map((row) => row.id)).toContain(ids.get('older-eligible'));
    });
  },
);

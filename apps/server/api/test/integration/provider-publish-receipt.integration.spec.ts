import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  Platform,
  PostCategory,
  PostFormat,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  claimProviderPublishAttempt,
  markProviderPublishAttemptUncertain,
  PROVIDER_PUBLISH_ATTEMPT_LEASE_MS,
  renewProviderPublishAttempt,
  reserveProviderPublishAttempt,
} from '@workers/services/scheduled-post-provider-receipt.util';
import { Client } from 'pg';
import { assertIsolatedDatabaseUrl } from '../../scripts/assert-isolated-db-url';

// Real PostgreSQL unique and token-guarded writes in an owned schema (#5882).
describe('Provider publish receipts (real Postgres)', () => {
  const schema = `provider_receipt_${randomUUID().replaceAll('-', '')}`;
  const userId = randomUUID();
  const organizationId = randomUUID();
  const brandId = randomUUID();
  let sql: Client;
  let prisma: PrismaClient;
  let receipts: PrismaService;

  const seedPost = async (): Promise<PostEntity> => {
    const id = randomUUID();
    await prisma.post.create({
      data: {
        id,
        brandId,
        category: PostCategory.TEXT,
        description: `Receipt publication ${id}`,
        format: PostFormat.STANDARD,
        organizationId,
        platform: Platform.TWITTER,
        targetAttachments: [],
        targetExecutionState: TargetExecutionState.PUBLISHING,
        targetSettings: {},
        timezone: 'UTC',
        userId,
        visibility: PostVisibility.PUBLIC,
      },
    });
    const post = await prisma.post.findFirstOrThrow({
      where: { id, organizationId, isDeleted: false },
      include: { ingredients: true },
    });
    return post as unknown as PostEntity;
  };

  beforeAll(async () => {
    const connectionString = assertIsolatedDatabaseUrl();
    sql = new Client({ connectionString });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}", public`);
    const ddl = execFileSync(
      'bunx',
      [
        'prisma',
        'migrate',
        'diff',
        '--from-empty',
        '--to-schema',
        resolve('../../../packages/prisma/prisma/schema.prisma'),
        '--script',
      ],
      {
        cwd: resolve('../../../packages/prisma'),
        encoding: 'utf8',
        timeout: 60000,
      },
    );
    await sql.query(
      ddl
        .replaceAll('"public".', '')
        .replace(/CREATE SCHEMA IF NOT EXISTS "public";/g, ''),
    );
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }, { schema }),
    });
    receipts = prisma as unknown as PrismaService;
    await prisma.user.create({
      data: { id: userId, handle: `receipt-${userId}` },
    });
    await prisma.organization.create({
      data: {
        id: organizationId,
        label: 'Receipt organization',
        slug: `receipt-${organizationId}`,
        userId,
      },
    });
    await prisma.brand.create({
      data: {
        id: brandId,
        isActive: true,
        label: 'Receipt brand',
        organizationId,
        slug: `receipt-${brandId}`,
        userId,
      },
    });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await sql?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sql?.end();
  });

  it('lets exactly one concurrent delivery reserve a post occurrence for the provider', async () => {
    const post = await seedPost();
    const attempts = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        reserveProviderPublishAttempt(
          receipts,
          post,
          `execution-${index}`,
        ).then(
          (attempt) => attempt.kind,
          (error: Error) => error.name,
        ),
      ),
    );
    expect(attempts.filter((kind) => kind === 'publish')).toHaveLength(1);
    expect(
      attempts
        .filter((kind) => kind !== 'publish')
        .every(
          (kind) =>
            kind === 'in_flight' || kind === 'ProviderPublishInFlightError',
        ),
    ).toBe(true);
    await expect(
      prisma.postProviderPublishReceipt.count({
        where: { organizationId, postId: String(post.id), isDeleted: false },
      }),
    ).resolves.toBe(1);
  });

  it('lets exactly one concurrent delivery take over an unconfirmed attempt', async () => {
    const post = await seedPost();
    const first = await reserveProviderPublishAttempt(
      receipts,
      post,
      'execution-first',
    );
    if (first.kind !== 'publish') throw new Error('expected a reservation');
    await markProviderPublishAttemptUncertain(receipts, post, first);
    const claims = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        claimProviderPublishAttempt(
          receipts,
          post,
          { ...first, status: 'uncertain' },
          `execution-retry-${index}`,
        ),
      ),
    );
    expect(claims.filter((claim) => claim !== null)).toHaveLength(1);
  });

  it('takes over a live attempt only after its holder stopped renewing the lease', async () => {
    const post = await seedPost();
    const holder = await reserveProviderPublishAttempt(
      receipts,
      post,
      'execution-holder',
    );
    if (holder.kind !== 'publish') throw new Error('expected a reservation');
    const expired = new Date(
      Date.now() - PROVIDER_PUBLISH_ATTEMPT_LEASE_MS - 60_000,
    );
    await prisma.postProviderPublishReceipt.update({
      where: { id: holder.receiptId },
      data: { attemptStartedAt: expired, leaseRenewedAt: expired },
    });
    // The holder renews after a takeover observed the expired lease.
    await expect(
      renewProviderPublishAttempt(receipts, post, holder, false),
    ).resolves.toBe(true);
    await expect(
      claimProviderPublishAttempt(
        receipts,
        post,
        { ...holder, status: 'attempting' },
        'execution-takeover',
      ),
    ).resolves.toBeNull();

    await prisma.postProviderPublishReceipt.update({
      where: { id: holder.receiptId },
      data: { leaseRenewedAt: expired },
    });
    const takeover = await claimProviderPublishAttempt(
      receipts,
      post,
      { ...holder, status: 'attempting' },
      'execution-takeover',
    );
    expect(takeover).not.toBeNull();
    // The stalled holder can no longer confirm the attempt before publishing.
    await expect(
      renewProviderPublishAttempt(receipts, post, holder, true),
    ).resolves.toBe(false);
  });

  it('never lets a stale takeover erase an accepted receipt', async () => {
    const post = await seedPost();
    const first = await reserveProviderPublishAttempt(
      receipts,
      post,
      'execution-first',
    );
    if (first.kind !== 'publish') throw new Error('expected a reservation');
    await prisma.postProviderPublishReceipt.update({
      where: { id: first.receiptId },
      data: { externalId: 'external-accepted', status: 'accepted' },
    });
    await expect(
      claimProviderPublishAttempt(
        receipts,
        post,
        { ...first, status: 'attempting' },
        'execution-stale',
      ),
    ).resolves.toBeNull();
    await expect(
      prisma.postProviderPublishReceipt.findUniqueOrThrow({
        where: { id: first.receiptId },
        select: { externalId: true, status: true },
      }),
    ).resolves.toEqual({ externalId: 'external-accepted', status: 'accepted' });
  });
});

import { randomUUID } from 'node:crypto';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PreparedProviderUpload, PublishResult } from '@api/index';
import { TargetExecutionState } from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService } from '@libs/prisma/prisma.service';
import { PrismaPg } from '@prisma/adapter-pg';
import type { PreparedPostDelivery } from '@workers/services/scheduled-post-delivery.types';
import {
  completePreparedUpload,
  preparedUploadInputDigest,
  reservePreparedUpload,
  takePreparedUpload,
} from '@workers/services/scheduled-post-prepared-upload.util';
import { ScheduledPostPreparedUploads } from '@workers/services/scheduled-post-prepared-uploads';
import { createFixtureTables } from '@workers/testing/schema-fixture-tables';
import { Pool } from 'pg';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: a disposable loopback database, never production.
const connection = process.env.WORKFLOW_BILLING_TEST_DATABASE_URL;

/**
 * An Instagram container made before the due time, against real PostgreSQL
 * rows (#11515): a retry or a crash between taking the container and
 * `media_publish` never publishes it twice, and an edit leaves it unused.
 */
describe.skipIf(!connection)('Prepared uploads (PostgreSQL)', () => {
  const schema = `prepared_uploads_${randomUUID().replaceAll('-', '')}`;
  const now = new Date('2026-11-27T11:57:00.000Z');
  let pool: Pool;
  let prisma: PrismaClient;

  const post = (description = 'Golden hour') =>
    ({
      description,
      id: 'post-1',
      ingredients: [{ id: 'image-1' }, { id: 'image-2' }],
      organizationId: 'org-1',
      publishApprovalId: 'approval-1',
      reviewVersionPinId: 'pin-1',
      scheduledDate: new Date('2026-11-27T12:00:00.000Z'),
    }) as unknown as PostEntity;

  const calls = { mediaPublish: 0, publishFromScratch: 0 };
  const accepted: PublishResult = {
    executionState: TargetExecutionState.PUBLISHED,
    externalId: 'media-1',
    platform: 'instagram',
    success: true,
    url: '',
  };
  const delivery = (settings: Record<string, unknown> = {}) =>
    ({
      context: {
        credential: { externalId: 'ig-1', id: 'credential-1' },
        post: { isShareToFeedSelected: true },
        settings,
      },
      platform: 'instagram',
      publisher: {
        publish: async () => {
          calls.publishFromScratch += 1;
          return accepted;
        },
        publishPrepared: async () => {
          calls.mediaPublish += 1;
          return accepted;
        },
      },
    }) as unknown as PreparedPostDelivery;
  const upload: PreparedProviderUpload = {
    expiresAt: new Date(now.getTime() + 10 * 60_000),
    providerUploadId: 'container-1',
  };

  const db = () => prisma as unknown as PrismaService;

  async function prepareReady(
    target: PostEntity = post(),
    inputs: PreparedPostDelivery = delivery(),
  ) {
    const lease = await reservePreparedUpload(
      db(),
      target,
      preparedUploadInputDigest(inputs),
      now,
    );
    if (!lease) throw new Error('expected a lease');
    expect(await completePreparedUpload(db(), target, lease, upload)).toBe(
      true,
    );
  }

  beforeAll(async () => {
    if (
      !connection ||
      !['localhost', '127.0.0.1', '[::1]'].includes(
        new URL(connection).hostname,
      )
    ) {
      throw new Error('Dedicated loopback PostgreSQL fixture is mandatory');
    }
    pool = new Pool({ connectionString: connection, max: 4 });
    const setup = await pool.connect();
    try {
      await setup.query(`CREATE SCHEMA "${schema}"`);
      await setup.query(`SET search_path TO "${schema}"`);
      await createFixtureTables(
        { query: setup.query.bind(setup) },
        new Set(['PostPreparedUpload']),
      );
    } finally {
      setup.release();
    }
    const url = new URL(connection);
    url.searchParams.set('options', `-c search_path=${schema}`);
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: url.toString(), max: 4 },
        { schema },
      ),
    });
  });

  beforeEach(async () => {
    calls.mediaPublish = 0;
    calls.publishFromScratch = 0;
    await pool.query(`TRUNCATE "${schema}"."post_prepared_uploads"`);
  });

  afterAll(async () => {
    await pool?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await prisma?.$disconnect();
    await pool?.end();
  });

  it('publishes the container once when a retry follows a crash between taking it and media_publish', async () => {
    await prepareReady();
    const uploads = new ScheduledPostPreparedUploads(
      db(),
      { warn: vi.fn() } as unknown as LoggerService,
      {} as never,
      {} as never,
    );
    // The first delivery takes the container and dies before media_publish.
    expect(
      await takePreparedUpload(
        db(),
        post(),
        preparedUploadInputDigest(delivery()),
        'attempt-1',
        now,
      ),
    ).toEqual(upload);

    // Its retry publishes from scratch; the container is never offered again.
    await uploads.publish(
      post(),
      delivery(),
      { attemptToken: 'attempt-2', receiptId: 'receipt-1' },
      'spec',
    );
    await uploads.publish(
      post(),
      delivery(),
      { attemptToken: 'attempt-3', receiptId: 'receipt-1' },
      'spec',
    );

    expect(calls).toEqual({ mediaPublish: 0, publishFromScratch: 2 });
  });

  it('hands the container to one of two deliveries that take it at once', async () => {
    await prepareReady();
    const digest = preparedUploadInputDigest(delivery());

    const taken = await Promise.all(
      ['attempt-1', 'attempt-2', 'attempt-3'].map((attempt) =>
        takePreparedUpload(db(), post(), digest, attempt, now),
      ),
    );

    expect(taken.filter(Boolean)).toEqual([upload]);
  });

  it('leaves the container unused once the caption was edited', async () => {
    await prepareReady(post('Golden hour'));

    expect(
      await takePreparedUpload(
        db(),
        post('Golden hour, edited'),
        preparedUploadInputDigest(delivery()),
        'attempt-1',
        now,
      ),
    ).toBeNull();
  });

  it('leaves the container unused once the target settings changed', async () => {
    await prepareReady();

    expect(
      await takePreparedUpload(
        db(),
        post(),
        preparedUploadInputDigest(delivery({ placement: 'reel' })),
        'attempt-1',
        now,
      ),
    ).toBeNull();
  });

  it('leaves an expired container unused', async () => {
    await prepareReady();

    expect(
      await takePreparedUpload(
        db(),
        post(),
        preparedUploadInputDigest(delivery()),
        'attempt-1',
        new Date(upload.expiresAt.getTime() + 1),
      ),
    ).toBeNull();
  });

  it('gives one of two sweeps that prepare the same post at once the lease', async () => {
    const digest = preparedUploadInputDigest(delivery());

    const leases = await Promise.all(
      [1, 2, 3].map(() => reservePreparedUpload(db(), post(), digest, now)),
    );

    expect(leases.filter(Boolean)).toHaveLength(1);
  });
});

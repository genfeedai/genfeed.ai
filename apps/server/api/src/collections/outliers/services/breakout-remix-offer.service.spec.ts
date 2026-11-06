import { BreakoutRemixOfferService } from '@api/collections/outliers/services/breakout-remix-offer.service';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivityKey, ActivitySource, Platform } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';

const actor = { organizationId: 'org-a', userId: 'user-a' };
const source = {
  brandId: 'brand-a',
  credentialId: 'credential-a',
  externalId: 'tweet-a',
  organizationId: 'org-a',
  platform: Platform.TWITTER,
};
const now = new Date('2026-10-21T08:00:00.000Z');
const detectedAt = new Date('2026-10-20T08:00:00.000Z');

interface ResponseRow {
  brandId: string;
  credentialId: string;
  detectedAt: Date;
  externalId: string;
  id: string;
  isDeleted: boolean;
  nativeSourcePost: { id: string; text: string | null } | null;
  organizationId: string;
  platform: string;
  sourcePost: {
    description: string;
    id: string;
    label: string | null;
  } | null;
}

interface RecordedActivity {
  alert: { deduplicationKey: string; payload: Record<string, unknown> };
  id: string;
  value: string;
}

const response = (overrides: Partial<ResponseRow> = {}): ResponseRow => ({
  ...source,
  detectedAt,
  id: 'response-a',
  isDeleted: false,
  nativeSourcePost: null,
  sourcePost: {
    description: 'Ship the thing before you feel ready.',
    id: 'post-a',
    label: null,
  },
  ...overrides,
});

/** A where value is an exact match, or `{ gte }` on a date column. */
function matches(row: ResponseRow, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    const field = row[key as keyof ResponseRow];
    if (value instanceof Object && 'gte' in value) {
      return (field as Date) >= (value as { gte: Date }).gte;
    }
    return field === value;
  });
}

function harness(
  rows: ResponseRow[],
  options: { recorderFails?: boolean } = {},
) {
  const activities: RecordedActivity[] = [];
  const warnings: { context: Record<string, unknown>; message: string }[] = [];
  const prisma = {
    breakoutResponse: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((row) => matches(row, where)) ?? null,
    },
  } as unknown as PrismaService;
  // The recorder deduplicates on the alert key: a repeat returns the first row.
  const recorder = {
    record: async (input: Omit<RecordedActivity, 'id'>) => {
      if (options.recorderFails) throw new Error('queue down');
      const existing = activities.find(
        (activity) =>
          activity.alert.deduplicationKey === input.alert.deduplicationKey,
      );
      if (existing) return { id: existing.id };
      const activity = { ...input, id: `activity-${activities.length + 1}` };
      activities.push(activity);
      return { id: activity.id };
    },
  } as unknown as ActivityRecorderService;
  const logger = {
    warn: (message: string, context: Record<string, unknown>) => {
      warnings.push({ context, message });
    },
  } as unknown as LoggerService;
  const service = new BreakoutRemixOfferService(prisma, recorder, logger);
  return { activities, service, warnings };
}

describe('BreakoutRemixOfferService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now, toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers a remix of the breaking-out post', async () => {
    const h = harness([response()]);

    await expect(h.service.offer(actor, source)).resolves.toBe('activity-1');

    expect(h.activities).toEqual([
      {
        alert: {
          deduplicationKey: `${ActivityKey.BREAKOUT_REMIX_OFFERED}/response-a`,
          occurredAt: detectedAt,
          payload: {
            brandId: 'brand-a',
            kind: 'breakout_remix_offer',
            platform: Platform.TWITTER,
            postId: 'post-a',
            responseId: 'response-a',
            sourcePostId: null,
            version: 1,
          },
          source: { id: 'response-a', type: 'breakout_response' },
        },
        brandId: 'brand-a',
        entityId: 'response-a',
        entityModel: 'BreakoutResponse',
        id: 'activity-1',
        key: ActivityKey.BREAKOUT_REMIX_OFFERED,
        organizationId: 'org-a',
        source: ActivitySource.BREAKOUT_DETECTION,
        userId: 'user-a',
        value:
          '“Ship the thing before you feel ready.” is outperforming your usual X posts',
      },
    ]);
  });

  it('offers once per response across repeat collections', async () => {
    const h = harness([response()]);

    await h.service.offer(actor, source);
    await expect(h.service.offer(actor, source)).resolves.toBe('activity-1');

    expect(h.activities).toHaveLength(1);
  });

  it('points at the native source post when the account post was not published from Genfeed', async () => {
    const h = harness([
      response({
        id: 'response-b',
        nativeSourcePost: { id: 'source-a', text: null },
        sourcePost: null,
      }),
    ]);

    await h.service.offer(actor, source);

    expect(h.activities[0]).toMatchObject({
      alert: { payload: { postId: null, sourcePostId: 'source-a' } },
      value: 'Your X post is outperforming your usual posts',
    });
  });

  it('shortens a long post to a readable preview', async () => {
    const h = harness([
      response({
        sourcePost: {
          description: 'word '.repeat(40),
          id: 'post-a',
          label: null,
        },
      }),
    ]);

    await h.service.offer(actor, source);

    expect(h.activities[0].value).toBe(
      `“${'word '.repeat(15)}word…” is outperforming your usual X posts`,
    );
  });

  it.each([
    ['no detected response', []],
    [
      'a response with no post to open',
      [response({ nativeSourcePost: null, sourcePost: null })],
    ],
    [
      'a response detected outside the offer window',
      [response({ detectedAt: new Date('2026-10-13T07:59:59.000Z') })],
    ],
    ['a deleted response', [response({ isDeleted: true })]],
    [
      'another organization response for the same post',
      [response({ organizationId: 'org-b' })],
    ],
    [
      'a response from another connected account',
      [response({ credentialId: 'credential-b' })],
    ],
  ])('offers nothing for %s', async (_name, rows) => {
    const h = harness(rows);

    await expect(h.service.offer(actor, source)).resolves.toBeNull();
    expect(h.activities).toEqual([]);
  });

  it.each([
    ['an API-key actor', { ...actor, isApiKey: true }],
    ['an actor from another organization', { ...actor, organizationId: 'x' }],
    ['an actor with no user', { ...actor, userId: '' }],
  ])('never notifies %s', async (_name, otherActor) => {
    const h = harness([response()]);

    await expect(h.service.offer(otherActor, source)).resolves.toBeNull();
    expect(h.activities).toEqual([]);
  });

  it('does not fail the collection when recording the offer fails', async () => {
    const h = harness([response()], { recorderFails: true });

    await expect(
      h.service.offerAfterCommit(actor, source),
    ).resolves.toBeUndefined();
    expect(h.warnings).toEqual([
      {
        context: expect.objectContaining({
          error: 'queue down',
          organizationId: 'org-a',
        }),
        message: 'Breakout remix offer was not recorded',
      },
    ]);
  });
});

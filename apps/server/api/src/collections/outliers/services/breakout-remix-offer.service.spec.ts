import { BreakoutRemixOfferService } from '@api/collections/outliers/services/breakout-remix-offer.service';
import { ActivityKey, ActivitySource, Platform } from '@genfeedai/contracts';

const actor = { organizationId: 'org-a', userId: 'user-a' };
const source = {
  brandId: 'brand-a',
  credentialId: 'credential-a',
  externalId: 'tweet-a',
  organizationId: 'org-a',
  platform: Platform.TWITTER,
};
const detectedAt = new Date('2026-10-20T08:00:00.000Z');

type Response = {
  detectedAt: Date;
  id: string;
  nativeSourcePost: { id: string; text: string | null } | null;
  sourcePost: {
    description: string;
    id: string;
    label: string | null;
  } | null;
};

function harness(response: Response | null) {
  const findFirst = vi.fn(async () => response);
  const record = vi.fn(async (_input: unknown) => ({ id: 'activity-a' }));
  const warn = vi.fn();
  const service = new BreakoutRemixOfferService(
    { breakoutResponse: { findFirst } } as never,
    { record } as never,
    { warn } as never,
  );
  return { findFirst, record, service, warn };
}

const ownedPost: Response = {
  detectedAt,
  id: 'response-a',
  nativeSourcePost: null,
  sourcePost: {
    description: 'Ship the thing before you feel ready.',
    id: 'post-a',
    label: null,
  },
};

describe('BreakoutRemixOfferService', () => {
  it('offers a remix of the breaking-out post, once per response', async () => {
    const h = harness(ownedPost);

    await expect(h.service.offer(actor, source)).resolves.toBe('activity-a');

    expect(h.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-a',
          credentialId: 'credential-a',
          externalId: 'tweet-a',
          isDeleted: false,
          organizationId: 'org-a',
          platform: Platform.TWITTER,
        }),
      }),
    );
    expect(h.record).toHaveBeenCalledWith({
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
      key: ActivityKey.BREAKOUT_REMIX_OFFERED,
      organizationId: 'org-a',
      source: ActivitySource.BREAKOUT_DETECTION,
      userId: 'user-a',
      value:
        '“Ship the thing before you feel ready.” is outperforming your usual X posts',
    });
  });

  it('points at the native source post when the account post was not published from Genfeed', async () => {
    const h = harness({
      detectedAt,
      id: 'response-b',
      nativeSourcePost: { id: 'source-a', text: null },
      sourcePost: null,
    });

    await h.service.offer(actor, source);

    expect(h.record).toHaveBeenCalledWith(
      expect.objectContaining({
        alert: expect.objectContaining({
          payload: expect.objectContaining({
            postId: null,
            sourcePostId: 'source-a',
          }),
        }),
        value: 'A X post is outperforming your usual posts',
      }),
    );
  });

  it('shortens a long post to a readable preview', async () => {
    const h = harness({
      ...ownedPost,
      sourcePost: {
        description: `${'word '.repeat(40)}`,
        id: 'post-a',
        label: null,
      },
    });

    await h.service.offer(actor, source);

    const [{ value }] = h.record.mock.calls[0] as [{ value: string }];
    expect(value.startsWith('“word word')).toBe(true);
    expect(value).toContain('…” is outperforming');
  });

  it.each([
    ['no detected response in the window', null],
    [
      'a response with no post to open',
      { ...ownedPost, nativeSourcePost: null, sourcePost: null },
    ],
  ])('offers nothing for %s', async (_name, response) => {
    const h = harness(response);

    await expect(h.service.offer(actor, source)).resolves.toBeNull();
    expect(h.record).not.toHaveBeenCalled();
  });

  it.each([
    ['an API-key actor', { ...actor, isApiKey: true }],
    ['an actor from another organization', { ...actor, organizationId: 'x' }],
    ['an actor with no user', { ...actor, userId: '' }],
  ])('never notifies %s', async (_name, otherActor) => {
    const h = harness(ownedPost);

    await expect(h.service.offer(otherActor, source)).resolves.toBeNull();
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.record).not.toHaveBeenCalled();
  });

  it('does not fail the collection when recording the offer fails', async () => {
    const h = harness(ownedPost);
    h.record.mockRejectedValueOnce(new Error('queue down'));

    await expect(
      h.service.offerAfterCommit(actor, source),
    ).resolves.toBeUndefined();
    expect(h.warn).toHaveBeenCalledWith(
      'Breakout remix offer was not recorded',
      expect.objectContaining({ error: 'queue down', organizationId: 'org-a' }),
    );
  });
});

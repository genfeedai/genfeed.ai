import type { ReplyBotConfigDocument } from '@api/collections/reply-bot-configs/schemas/reply-bot-config.schema';
import { ReplyCandidatePrefilterService } from '@api/services/reply-bot/reply-candidate-prefilter.service';
import type { SocialContentData } from '@api/services/reply-bot/social-monitor.service';
import {
  ReplyBotPlatform,
  ReplyBotType,
  SocialContentType,
} from '@genfeedai/enums';

const makeContent = (
  overrides: Partial<SocialContentData> = {},
): SocialContentData => ({
  authorFollowersCount: 100,
  authorId: 'author-1',
  authorUsername: 'alice',
  contentType: SocialContentType.TWEET,
  contentUrl: 'https://x.com/alice/status/tweet-1',
  createdAt: new Date('2026-06-01T00:00:00.000Z'),
  hashtags: ['ai'],
  id: 'tweet-1',
  metrics: { comments: 3, likes: 10, shares: 2, views: 1000 },
  platform: ReplyBotPlatform.TWITTER,
  text: 'Useful AI workflow discussion',
  ...overrides,
});

const makeConfig = (
  filters: ReplyBotConfigDocument['filters'] = {},
): ReplyBotConfigDocument =>
  ({
    _id: 'bot-1',
    filters,
    organization: 'org-1',
    type: ReplyBotType.REPLY_GUY,
  }) as ReplyBotConfigDocument;

describe('ReplyCandidatePrefilterService', () => {
  let service: ReplyCandidatePrefilterService;

  beforeEach(() => {
    service = new ReplyCandidatePrefilterService();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T01:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('deduplicates candidates by canonical target before generation', () => {
    const result = service.prefilter(
      [
        makeContent({ id: 'tweet-1' }),
        makeContent({ id: 'tweet-1' }),
        makeContent({
          contentUrl: 'https://x.com/bob/status/tweet-3',
          id: 'tweet-3',
        }),
      ],
      {
        botConfig: makeConfig(),
        botType: ReplyBotType.REPLY_GUY,
        credential: { accessToken: 'token', username: 'brand' },
        organizationId: 'org-1',
        platform: ReplyBotPlatform.TWITTER,
      },
    );

    expect(result.candidates).toHaveLength(2);
    expect(result.skipped).toBe(1);
    expect(result.skipCounts.duplicate).toBe(1);
  });

  it('applies author, URL, keyword, freshness, and quality exclusions', () => {
    const result = service.prefilter(
      [
        makeContent({ authorUsername: 'blocked' }),
        makeContent({
          contentUrl: 'https://spam.test/post',
          id: 'tweet-2',
        }),
        makeContent({ id: 'tweet-3', text: 'Crypto workflow spam' }),
        makeContent({
          createdAt: new Date('2026-05-31T00:00:00.000Z'),
          id: 'tweet-4',
        }),
        makeContent({ authorFollowersCount: 3, id: 'tweet-5' }),
        makeContent({
          contentUrl: 'https://x.com/alice/status/tweet-6',
          id: 'tweet-6',
          text: 'Thoughtful AI launch workflow breakdown',
        }),
      ],
      {
        botConfig: makeConfig({
          excludeAuthors: ['blocked'],
          excludeKeywords: ['crypto'],
          excludeUrls: ['spam.test'],
          includeKeywords: ['workflow'],
          maxAgeHours: 2,
          minFollowers: 10,
          minTextLength: 10,
        }),
        botType: ReplyBotType.REPLY_GUY,
        credential: { accessToken: 'token', username: 'brand' },
        organizationId: 'org-1',
        platform: ReplyBotPlatform.TWITTER,
      },
    );

    expect(result.candidates.map((candidate) => candidate.id)).toEqual([
      'tweet-6',
    ]);
    expect(result.skipCounts.excluded_author).toBe(1);
    expect(result.skipCounts.excluded_url).toBe(1);
    expect(result.skipCounts.excluded_keyword).toBe(1);
    expect(result.skipCounts.too_old).toBe(1);
    expect(result.skipCounts.followers_too_low).toBe(1);
  });

  it('adds available thread and engagement context to accepted candidates', () => {
    const result = service.prefilter(
      [
        makeContent({
          inReplyToId: 'parent-1',
          parentContentId: 'thread-1',
        }),
      ],
      {
        botConfig: makeConfig(),
        botType: ReplyBotType.COMMENT_RESPONDER,
        credential: { accessToken: 'token', username: 'brand' },
        organizationId: 'org-1',
        platform: ReplyBotPlatform.TWITTER,
      },
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].replyContext).toContain(
      'Parent content ID: thread-1',
    );
    expect(result.candidates[0].replyContext).toContain(
      'In reply to ID: parent-1',
    );
    expect(result.candidates[0].replyContext).toContain(
      'Engagement: likes 10, comments 3, shares 2, views 1000',
    );
  });
});

import type {
  ConversationScore,
  ConversationSource,
} from '@api/collections/agent-strategies/services/agent-strategy-conversation-queue.types';
import {
  CONVERSATION_FRESHNESS_HOURS,
  isSameScope,
  scoreConversation,
} from '@api/collections/agent-strategies/services/agent-strategy-conversation-queue.util';

const NOW = new Date('2026-10-27T12:00:00.000Z');
const TOPICS = ['video generation', 'brand voice'];

function post(overrides: Partial<ConversationSource> = {}): ConversationSource {
  return {
    authorUsername: 'maker',
    content: 'How do you keep a consistent brand voice in video generation?',
    createdAt: new Date(NOW.getTime() - 2 * 3_600_000).toISOString(),
    id: '1',
    url: 'https://x.com/maker/status/1',
    ...overrides,
  };
}

function score(source: ConversationSource, ownHandle?: string) {
  return scoreConversation(source, { now: NOW, ownHandle, topics: TOPICS });
}

function scored(source: ConversationSource): ConversationScore {
  const result = score(source);
  if (!result) {
    throw new Error('Expected the post to be scored');
  }
  return result;
}

describe('scoreConversation', () => {
  it('ranks a fresh question on both topics above a stale statement on one', () => {
    const strong = scored(post());
    const weak = scored(
      post({
        content: 'Notes on video generation costs this quarter.',
        createdAt: new Date(NOW.getTime() - 40 * 3_600_000).toISOString(),
      }),
    );

    expect(strong.relevanceScore).toBe(100);
    expect(strong.reason).toContain('asks a question');
    expect(strong.reason).toContain('video generation');
    expect(weak.relevanceScore).toBe(50);
    expect(strong.priorityScore).toBeGreaterThan(weak.priorityScore);
  });

  it('gives a fresher post a higher recency score', () => {
    const recent = scored(
      post({ createdAt: new Date(NOW.getTime() - 3_600_000).toISOString() }),
    );
    const older = scored(
      post({
        createdAt: new Date(NOW.getTime() - 24 * 3_600_000).toISOString(),
      }),
    );

    expect(recent.recencyScore).toBeGreaterThan(older.recencyScore);
  });

  it('drops posts that are stale, off topic, our own, or reposts', () => {
    expect(
      score(
        post({
          createdAt: new Date(
            NOW.getTime() - CONVERSATION_FRESHNESS_HOURS * 3_600_000,
          ).toISOString(),
        }),
      ),
    ).toBeNull();
    expect(
      score(post({ content: 'Lunch was great today, friends.' })),
    ).toBeNull();
    expect(score(post(), '@Maker')).toBeNull();
    expect(
      score(post({ content: 'RT @someone: video generation is here' })),
    ).toBeNull();
  });

  it('drops a post dated in the future', () => {
    expect(
      score(
        post({ createdAt: new Date(NOW.getTime() + 3_600_000).toISOString() }),
      ),
    ).toBeNull();
  });

  it('marks a crowded thread down for contribution', () => {
    const quiet = scored(post({ replyCount: 3 }));
    const crowded = scored(post({ replyCount: 400 }));

    expect(crowded.contributionScore).toBeLessThan(quiet.contributionScore);
    expect(crowded.reason).toContain('busy thread');
  });
});

describe('isSameScope', () => {
  it('compares the brand and the connected account', () => {
    expect(isSameScope({ brandId: 'b1' }, { brandId: 'b1' })).toBe(true);
    expect(
      isSameScope({ brandId: 'b1', credentialId: 'c1' }, { brandId: 'b1' }),
    ).toBe(false);
    expect(isSameScope({ brandId: 'b1' }, { brandId: 'b2' })).toBe(false);
  });
});

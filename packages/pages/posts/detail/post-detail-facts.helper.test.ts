import { CredentialPlatform, PostCategory } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import { buildPostDetailFacts } from '@pages/posts/detail/post-detail-facts.helper';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@helpers/formatting/timezone/timezone.helper', () => ({
  getBrowserTimezone: () => 'America/New_York',
}));

function buildPost(overrides: Partial<IPost> = {}): IPost {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'post-1',
    isDeleted: false,
    status: 'draft',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as IPost;
}

describe('buildPostDetailFacts', () => {
  it('includes the known platform, status and category', () => {
    const facts = buildPostDetailFacts(
      buildPost({
        category: PostCategory.POST,
        platform: CredentialPlatform.TWITTER,
        status: 'scheduled',
      }),
      false,
    );

    const byId = new Map(facts.map((fact) => [fact.id, fact.value]));
    expect(byId.get('platform')).toBe('(X) Twitter');
    expect(byId.get('status')).toBe('Scheduled');
    expect(byId.get('category')).toBe(PostCategory.POST);
  });

  it('reads the scheduled date before publish and the publication date after', () => {
    const scheduled = buildPostDetailFacts(
      buildPost({ scheduledDate: '2026-05-01T12:00:00.000Z' }),
      false,
    );
    expect(scheduled.find((fact) => fact.id === 'when')?.value).toBeDefined();
    expect(scheduled.find((fact) => fact.id === 'when')?.label).toBe(
      'Scheduled',
    );

    const published = buildPostDetailFacts(
      buildPost({ publicationDate: '2026-05-02T12:00:00.000Z' }),
      true,
    );
    expect(published.find((fact) => fact.id === 'when')?.value).toBeDefined();
    expect(published.find((fact) => fact.id === 'when')?.label).toBe(
      'Published',
    );
  });

  it('only reports views once the post is published', () => {
    const draft = buildPostDetailFacts(buildPost({ totalViews: 42 }), false);
    expect(draft.find((fact) => fact.id === 'views')?.value).toBeUndefined();

    const published = buildPostDetailFacts(buildPost({ totalViews: 42 }), true);
    expect(published.find((fact) => fact.id === 'views')?.value).toBe(42);
  });

  it('treats a zero SEO score as a known fact', () => {
    const facts = buildPostDetailFacts(buildPost({ seoScore: 0 }), false);
    expect(facts.find((fact) => fact.id === 'seoScore')?.value).toBe(0);
  });

  it('formats the schedule time in the browser timezone, matching the schedule editor', () => {
    // Noon UTC on Jan 1 is 7am in America/New_York (UTC-5 in January) — a
    // UTC-only formatter would show a different hour than the editor, which
    // renders in the viewer's own timezone via the same `getBrowserTimezone`.
    const facts = buildPostDetailFacts(
      buildPost({ scheduledDate: '2026-01-01T12:00:00.000Z' }),
      false,
    );

    const when = facts.find((fact) => fact.id === 'when')?.value;
    expect(when).toContain('7:00');
    expect(when).not.toContain('12:00');
  });
});

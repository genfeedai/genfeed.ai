import { resolveKnowledgeActor } from '@api/collections/contexts/utils/knowledge-actor.util';
import { describe, expect, it } from 'vitest';

const user = {
  id: 'opaqueUser',
  userId: 'opaqueUser',
  organizationId: 'org',
  brandId: 'stale-brand',
};

describe('Knowledge HTTP actor', () => {
  it('requires explicit brand selection instead of inheriting last-used or API-key defaults', () => {
    expect(resolveKnowledgeActor(user)).toEqual({
      organizationId: 'org',
      userId: 'opaqueUser',
      brandId: undefined,
    });
    expect(resolveKnowledgeActor(user, 'selected-brand')).toEqual({
      organizationId: 'org',
      userId: 'opaqueUser',
      brandId: 'selected-brand',
    });
    expect(
      resolveKnowledgeActor({ ...user, brandId: 'org' }).brandId,
    ).toBeUndefined();
  });

  it('rejects structured brand input without interpreting it as a Prisma filter', () => {
    expect(() => resolveKnowledgeActor(user, ['brand-a', 'brand-b'])).toThrow(
      'single string',
    );
    expect(() => resolveKnowledgeActor(user, { not: null })).toThrow(
      'single string',
    );
  });
});

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

describe('explicit read-only knowledge data scope', () => {
  it('selects data organization while preserving real actor and explicit brand semantics', () => {
    const readScope = {
      organizationId: 'selected-org',
      brandId: 'selected-brand',
      isOrganizationOverride: true,
    };
    expect(resolveKnowledgeActor(user, 'selected-brand', readScope)).toEqual({
      organizationId: 'selected-org',
      userId: user.userId,
      brandId: 'selected-brand',
    });
    expect(resolveKnowledgeActor(user, undefined, readScope)).toEqual({
      organizationId: 'selected-org',
      userId: user.userId,
      brandId: undefined,
    });
    expect(resolveKnowledgeActor(user)).toEqual({
      organizationId: 'org',
      userId: user.userId,
      brandId: undefined,
    });
    expect(() =>
      resolveKnowledgeActor(user, ['selected-brand'], readScope),
    ).toThrow('single string');
  });
});

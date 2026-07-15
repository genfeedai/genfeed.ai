import { describe, expect, it } from 'vitest';
import { toAgentRequestPageContext } from './agent-page-context.util';

describe('toAgentRequestPageContext', () => {
  it('copies typed social selectors only into the current request context', () => {
    const socialReferences = [
      {
        brandId: 'brand-1',
        conversationId: 'conversation-1',
        kind: 'social-conversation' as const,
        organizationId: 'organization-1',
      },
    ];

    expect(
      toAgentRequestPageContext({
        placeholder: 'UI-only placeholder',
        route: '/acme/brand/messages',
        socialReferences,
        suggestedActions: [],
      }),
    ).toEqual({
      route: '/acme/brand/messages',
      socialReferences,
    });
  });

  it('forwards scoped Research selectors without UI-only composer metadata', () => {
    const researchReferences = [
      {
        brandId: 'brand-1',
        id: 'trend-1',
        kind: 'research-trend-video' as const,
        organizationId: 'organization-1',
      },
    ];

    expect(
      toAgentRequestPageContext({
        placeholder: 'UI-only placeholder',
        researchReferences,
        route: '/acme/brand/research/discovery',
        suggestedActions: [],
      }),
    ).toEqual({
      researchReferences,
      route: '/acme/brand/research/discovery',
    });
  });
});

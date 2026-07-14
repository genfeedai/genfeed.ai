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
});

import { describe, expect, it } from 'vitest';
import { toAgentRequestPageContext } from './agent-page-context.util';

describe('toAgentRequestPageContext', () => {
  it('returns undefined for missing or empty context', () => {
    expect(toAgentRequestPageContext(undefined)).toBeUndefined();
    expect(toAgentRequestPageContext(null)).toBeUndefined();
    expect(
      toAgentRequestPageContext({
        route: '   ',
        suggestedActions: [],
      }),
    ).toBeUndefined();
  });

  it('keeps only non-empty text fields and typed collections', () => {
    const analyticsQuery = {
      dateRange: { endDate: '2026-08-14', startDate: '2026-08-07' },
      filters: {},
      id: 'query-1',
      kind: 'analytics-query' as const,
      organizationId: 'org-1',
      provenance: {
        authority: 'server-hydrated' as const,
        source: 'genfeed-analytics-api' as const,
        summaryAuthority: 'derivative' as const,
      },
      route: '/analytics',
      version: 1 as const,
    };
    const researchReferences = [
      {
        brandId: 'brand-1',
        id: 'finding-1',
        kind: 'research-trend-hashtag' as const,
        organizationId: 'org-1',
      },
    ];
    const socialReferences = [
      {
        brandId: 'brand-1',
        conversationId: 'conv-1',
        kind: 'social-conversation' as const,
        organizationId: 'org-1',
      },
    ];

    expect(
      toAgentRequestPageContext({
        analyticsQuery,
        draftTitle: 'Launch recap',
        postAuthor: '   ',
        researchReferences,
        route: '/publishing/review',
        socialReferences,
        suggestedActions: [],
        url: '',
      }),
    ).toEqual({
      analyticsQuery,
      draftTitle: 'Launch recap',
      researchReferences,
      route: '/publishing/review',
      socialReferences,
    });
  });

  it('drops empty collections and non-analytics query objects', () => {
    expect(
      toAgentRequestPageContext({
        analyticsQuery: { kind: 'other' } as never,
        researchReferences: [],
        route: '/studio',
        socialReferences: [],
        suggestedActions: [],
      }),
    ).toEqual({
      route: '/studio',
    });
  });
});

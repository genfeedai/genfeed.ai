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
      toAgentRequestPageContext(
        {
          analyticsQuery,
          draftTitle: 'Launch recap',
          postAuthor: '   ',
          researchReferences,
          route: '/publishing/review',
          socialReferences,
          suggestedActions: [],
          url: '',
        },
        'Europe/Paris',
      ),
    ).toEqual({
      analyticsQuery,
      draftTitle: 'Launch recap',
      researchReferences,
      route: '/publishing/review',
      socialReferences,
      timezone: 'Europe/Paris',
    });
  });

  it('drops empty collections and non-analytics query objects', () => {
    expect(
      toAgentRequestPageContext(
        {
          analyticsQuery: { kind: 'other' } as never,
          researchReferences: [],
          route: '/studio',
          socialReferences: [],
          suggestedActions: [],
        },
        'UTC',
      ),
    ).toEqual({
      route: '/studio',
      timezone: 'UTC',
    });
  });

  it('attaches the browser timezone by default and keeps an explicit one', () => {
    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    expect(
      toAgentRequestPageContext({ route: '/agent', suggestedActions: [] }),
    ).toEqual({ route: '/agent', timezone: browserTimezone });
    expect(
      toAgentRequestPageContext(
        {
          route: '/agent',
          suggestedActions: [],
          timezone: 'America/New_York',
        },
        'Europe/Paris',
      ),
    ).toEqual({ route: '/agent', timezone: 'America/New_York' });
  });

  it('does not send a timezone-only context', () => {
    expect(
      toAgentRequestPageContext(
        { route: ' ', suggestedActions: [] },
        'Europe/Paris',
      ),
    ).toBeUndefined();
  });
});

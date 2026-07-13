import type { AgentPageContext } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import { describe, expect, it } from 'vitest';
import { buildPageContextPrompt } from './agent-page-context.util';

describe('buildPageContextPrompt Analytics references', () => {
  it('keeps Analytics values non-authoritative and emits scoped query metadata', () => {
    const pageContext: AgentPageContext = {
      analyticsQuery: {
        brandId: 'brand-1',
        dateRange: { endDate: '2024-06-30', startDate: '2024-06-01' },
        filters: { metric: 'views', platform: 'instagram' },
        id: 'analytics-query-1',
        kind: 'analytics-query',
        metric: 'views',
        organizationId: 'org-1',
        provenance: {
          authority: 'server-hydrated',
          source: 'genfeed-analytics-api',
          summaryAuthority: 'derivative',
        },
        route: '/analytics/posts',
        version: 1,
      },
      route: '/acme/moonrise/analytics/posts',
    };

    const prompt = buildPageContextPrompt(pageContext);

    expect(prompt).toContain('Visible Analytics Query Reference');
    expect(prompt).toContain('Organization id: org-1');
    expect(prompt).toContain('metric=views, platform=instagram');
    expect(prompt).toContain('grants no scope or permission');
    expect(prompt).toContain('derivative and non-authoritative');
    expect(prompt).not.toContain('Metric value');
  });
});

import { describe, expect, it } from 'vitest';
import { buildAppUsageInsights } from './setup-app-usage-dashboard';

describe('buildAppUsageInsights', () => {
  it('excludes internal people and bounds every query to the window', () => {
    const insights = buildAppUsageInsights(14);

    expect(insights).toHaveLength(3);
    for (const insight of insights) {
      expect(insight.query).toContain('is_internal');
      expect(insight.query).toContain('INTERVAL 14 DAY');
    }
  });

  it('reads the app property from pageviews and actions from ui_action_clicked', () => {
    const [byApp, , actions] = buildAppUsageInsights(30);

    expect(byApp?.query).toContain("event = '$pageview'");
    expect(byApp?.query).toContain('properties.app');
    expect(actions?.query).toContain("event = 'ui_action_clicked'");
  });

  it('falls back to a one day window for an invalid size', () => {
    expect(buildAppUsageInsights(0)[0]?.query).toContain('INTERVAL 1 DAY');
  });
});

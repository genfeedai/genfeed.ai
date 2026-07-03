import type { AgentRunDocument } from '@api/collections/agent-runs/schemas/agent-run.schema';
import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { describe, expect, it } from 'vitest';

import { ContentRotationService } from './content-rotation.service';

describe('ContentRotationService', () => {
  const service = new ContentRotationService();

  function strategy(
    overrides: Partial<AgentStrategyDocument>,
  ): AgentStrategyDocument {
    return {
      id: 'strategy-default',
      agentType: 'general',
      creditsUsedThisWeek: 0,
      dailyCreditBudget: 10,
      dailyCreditsUsed: 0,
      isEnabled: true,
      label: 'Default',
      monthToDateCreditsUsed: 0,
      organization: 'org-1',
      platforms: [],
      reserveTrendBudgetRemaining: 0,
      runHistory: [],
      topics: [],
      user: 'user-1',
      weeklyCreditBudget: 0,
      ...overrides,
    } as AgentStrategyDocument;
  }

  function run(targetKey: string): AgentRunDocument {
    return {
      id: `run-${targetKey}`,
      isDeleted: false,
      metadata: { contentRotationTargetKey: targetKey },
      organization: 'org-1',
      organizationId: 'org-1',
      user: 'user-1',
      userId: 'user-1',
    } as AgentRunDocument;
  }

  it('selects the most underrepresented configured topic bucket', () => {
    const launch = strategy({
      id: 'launch-strategy',
      label: 'Launch',
      platforms: ['linkedin'],
      topics: ['launch'],
    });
    const education = strategy({
      id: 'education-strategy',
      label: 'Education',
      platforms: ['linkedin'],
      topics: ['education'],
    });

    const result = service.selectStrategies({
      config: {
        enabled: true,
        targets: [
          { key: 'launch', topic: 'launch', weight: 60 },
          { key: 'education', topic: 'education', weight: 40 },
        ],
      },
      recentRuns: [run('launch'), run('launch'), run('education')],
      strategies: [launch, education],
    });

    expect(result.selection).toMatchObject({
      key: 'education',
      recentCount: 1,
      topic: 'education',
    });
    expect(result.selectedStrategies).toEqual([education]);
  });

  it('scopes rotation targets by platform and strategy when configured', () => {
    const xStrategy = strategy({
      id: 'x-strategy',
      platforms: ['twitter'],
      topics: ['launch'],
    });
    const linkedinStrategy = strategy({
      id: 'linkedin-strategy',
      platforms: ['linkedin'],
      topics: ['launch'],
    });

    const result = service.selectStrategies({
      config: {
        targets: [
          {
            key: 'linkedin-launch',
            platform: 'linkedin',
            strategyId: 'linkedin-strategy',
            topic: 'launch',
            weight: 50,
          },
          { key: 'x-launch', platform: 'twitter', topic: 'launch', weight: 50 },
        ],
      },
      recentRuns: [run('x-launch')],
      strategies: [xStrategy, linkedinStrategy],
    });

    expect(result.selection).toMatchObject({
      key: 'linkedin-launch',
      platform: 'linkedin',
      topic: 'launch',
    });
    expect(result.selectedStrategies).toEqual([linkedinStrategy]);
  });

  it('falls back to original strategies when weights are missing or unusable', () => {
    const strategies = [
      strategy({ id: 'one', topics: ['one'] }),
      strategy({ id: 'two', topics: ['two'] }),
    ];

    expect(
      service.selectStrategies({
        config: undefined,
        recentRuns: [run('one')],
        strategies,
      }),
    ).toEqual({ selectedStrategies: strategies });

    expect(
      service.selectStrategies({
        config: {
          enabled: true,
          targets: [{ key: 'missing-topic', topic: 'missing', weight: 100 }],
        },
        recentRuns: [],
        strategies,
      }),
    ).toEqual({ selectedStrategies: strategies });
  });
});

import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import {
  shouldAutoPublish,
  strategySkillSlugs,
} from '@api/collections/agent-strategies/services/agent-strategy-autopilot.helpers';
import { AgentAutonomyMode } from '@genfeedai/contracts';

describe('strategySkillSlugs', () => {
  const fallback = ['content-writing'];

  it('uses the fallback when the strategy has no skill policy', () => {
    expect(strategySkillSlugs({} as AgentStrategyDocument, fallback)).toEqual(
      fallback,
    );
  });

  it('preserves an explicit empty list as brand-default inheritance', () => {
    expect(
      strategySkillSlugs(
        { skillSlugs: [] } as unknown as AgentStrategyDocument,
        fallback,
      ),
    ).toEqual([]);
  });

  it('preserves an explicit skill subset', () => {
    expect(
      strategySkillSlugs(
        { skillSlugs: ['brand-voice'] } as unknown as AgentStrategyDocument,
        fallback,
      ),
    ).toEqual(['brand-voice']);
  });
});

describe('shouldAutoPublish', () => {
  function strategy(
    autonomyMode: AgentAutonomyMode | undefined,
    autoPublishEnabled: boolean | undefined,
  ): AgentStrategyDocument {
    return {
      autonomyMode,
      publishPolicy:
        autoPublishEnabled === undefined ? undefined : { autoPublishEnabled },
    } as unknown as AgentStrategyDocument;
  }

  it('lets a supervised agent that opted in reach the publish gate, so a graduated platform can publish', () => {
    expect(
      shouldAutoPublish(strategy(AgentAutonomyMode.SUPERVISED, true)),
    ).toBe(true);
  });

  it('lets an auto-publish agent that opted in reach the publish gate', () => {
    expect(
      shouldAutoPublish(strategy(AgentAutonomyMode.AUTO_PUBLISH, true)),
    ).toBe(true);
  });

  it.each([
    [AgentAutonomyMode.AUTO_PUBLISH, false],
    [AgentAutonomyMode.AUTO_PUBLISH, undefined],
    [undefined, undefined],
  ])(
    'sends %s drafts with auto-publish %s straight to review',
    (mode, isOn) => {
      expect(shouldAutoPublish(strategy(mode, isOn))).toBe(false);
    },
  );
});

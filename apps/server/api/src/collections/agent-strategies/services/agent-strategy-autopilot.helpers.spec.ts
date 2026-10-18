import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import {
  scoreTextPublishGate,
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

describe('scoreTextPublishGate length check', () => {
  const strategy = {
    goalProfile: 'engagement',
    publishPolicy: { minPostScore: 70 },
  } as unknown as AgentStrategyDocument;
  const strongAnalysis = {
    metadata: { hasCallToAction: true },
    overallScore: 88,
  };

  it('approves a strong draft that fits X', () => {
    const gate = scoreTextPublishGate(
      strategy,
      'a'.repeat(280),
      strongAnalysis,
      'twitter',
    );
    expect(gate.decision).toBe('approved');
    expect(gate.isOverPlatformLimit).toBeUndefined();
  });

  it('sends a strong but over-length X draft to revision with a shorten instruction', () => {
    const gate = scoreTextPublishGate(
      strategy,
      'a'.repeat(281),
      strongAnalysis,
      'twitter',
    );
    expect(gate.decision).toBe('revise');
    expect(gate.isOverPlatformLimit).toBe(true);
    expect(gate.reasons).toContain(
      'Draft is 281 characters; the twitter limit is 280.',
    );
    expect(gate.revisionInstructions[0]).toContain('280 characters max');
  });

  it('measures X the way the publisher does: CJK weighs 2, links weigh 23', () => {
    expect(
      scoreTextPublishGate(
        strategy,
        '日'.repeat(141),
        strongAnalysis,
        'twitter',
      ).isOverPlatformLimit,
    ).toBe(true);
    expect(
      scoreTextPublishGate(
        strategy,
        `${'a'.repeat(250)} https://example.com/${'p'.repeat(200)}`,
        strongAnalysis,
        'twitter',
      ).decision,
    ).toBe('approved');
  });

  it('skips the length check when no platform is given', () => {
    expect(
      scoreTextPublishGate(strategy, 'a'.repeat(5000), strongAnalysis).decision,
    ).toBe('approved');
  });
});

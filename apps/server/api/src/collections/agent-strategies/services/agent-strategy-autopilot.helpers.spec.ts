import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import { strategySkillSlugs } from '@api/collections/agent-strategies/services/agent-strategy-autopilot.helpers';

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

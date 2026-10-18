import { applyAgentBriefTargets } from '@api/services/agent-orchestrator/tools/agent-brief-targets.util';
import { describe, expect, it } from 'vitest';

const brief = { platforms: ['linkedin', 'instagram'], topics: ['craft', 'ai'] };

function parametersOf(
  result: ReturnType<typeof applyAgentBriefTargets>,
): Record<string, unknown> {
  if ('refusal' in result) throw new Error(result.refusal.error);
  return result.parameters;
}

describe('applyAgentBriefTargets', () => {
  it('fills a batch run with the configured platforms and topics instead of a tool default', () => {
    expect(
      parametersOf(
        applyAgentBriefTargets('generate_turbo_content', { count: 4 }, brief),
      ),
    ).toEqual({ count: 4, platforms: brief.platforms, topics: brief.topics });
  });

  it('drops platforms the agent was not configured for', () => {
    expect(
      parametersOf(
        applyAgentBriefTargets(
          'generate_turbo_content',
          { platforms: ['twitter', 'instagram'], topics: ['launch'] },
          brief,
        ),
      ),
    ).toEqual({ platforms: ['instagram'], topics: ['launch'] });
    expect(
      parametersOf(
        applyAgentBriefTargets(
          'generate_monthly_content',
          { platforms: ['twitter'] },
          brief,
        ),
      ).platforms,
    ).toEqual(brief.platforms);
  });

  it('never writes a social post for Twitter when other platforms are configured', () => {
    expect(
      parametersOf(applyAgentBriefTargets('generate_content', {}, brief)),
    ).toEqual({ platform: 'linkedin', topic: 'craft' });
    expect(
      parametersOf(
        applyAgentBriefTargets(
          'generate_content',
          { platform: 'twitter', topic: 'launch' },
          brief,
        ),
      ),
    ).toEqual({ platform: 'linkedin', topic: 'launch' });
    expect(
      parametersOf(
        applyAgentBriefTargets(
          'generate_content',
          { platform: 'instagram', topic: 'launch' },
          brief,
        ),
      ),
    ).toEqual({ platform: 'instagram', topic: 'launch' });
  });

  it('refuses generation for an agent with no configured platform', () => {
    const result = applyAgentBriefTargets(
      'generate_turbo_content',
      {},
      { platforms: [], topics: ['craft'] },
    );
    expect(result).toEqual({
      refusal: expect.objectContaining({ creditsUsed: 0, success: false }),
    });
  });

  it('leaves long-form and unrelated tools untouched', () => {
    const article = { type: 'article', topic: 'launch' };
    expect(
      parametersOf(applyAgentBriefTargets('generate_content', article, brief)),
    ).toBe(article);
    const review = { limit: 5 };
    expect(
      parametersOf(applyAgentBriefTargets('list_review_queue', review, brief)),
    ).toBe(review);
  });
});

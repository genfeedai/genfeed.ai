import type { StudioStoryboardProposal } from '@genfeedai/contracts/api-types/contracts';
import {
  buildStoryboardAgentBrief,
  storyboardProposalRuntime,
} from '@pages/studio/storyboard/utils/storyboard-agent-brief';
import { describe, expect, it } from 'vitest';

const labels = {
  shotLine: ({
    description,
    index,
    seconds,
  }: {
    description: string;
    index: number;
    seconds: number;
  }) => `${index}. (${seconds}s) ${description}`,
  shotsHeading: 'Shots:',
};

const proposal: StudioStoryboardProposal = {
  brief: 'A founder shows the serum going from lab to shelf.',
  shots: [
    { description: 'Lab bench close-up', durationSeconds: 5 },
    { description: 'Bottle on the shelf', durationSeconds: 7 },
  ],
  title: 'Lab to shelf',
  why: 'Origin stories held viewers longest.',
};

describe('buildStoryboardAgentBrief', () => {
  it('writes the story then the numbered shot plan', () => {
    expect(buildStoryboardAgentBrief(proposal, labels, 2000)).toEqual({
      brief:
        'A founder shows the serum going from lab to shelf.\n\nShots:\n1. (5s) Lab bench close-up\n2. (7s) Bottle on the shelf',
      runtimeBudgetSeconds: 12,
    });
  });

  it('drops whole shots that would pass the limit', () => {
    const limit = proposal.brief.length + '\n\nShots:'.length + 30;
    const { brief } = buildStoryboardAgentBrief(proposal, labels, limit);

    expect(brief).toContain('1. (5s) Lab bench close-up');
    expect(brief).not.toContain('Bottle on the shelf');
    expect(brief.length).toBeLessThanOrEqual(limit);
  });

  it('keeps only the story when no shot fits', () => {
    expect(
      buildStoryboardAgentBrief(proposal, labels, proposal.brief.length).brief,
    ).toBe(proposal.brief);
  });
});

describe('storyboardProposalRuntime', () => {
  it('caps the runtime at the 60 second budget', () => {
    expect(
      storyboardProposalRuntime({
        ...proposal,
        shots: [
          { description: 'a', durationSeconds: 30 },
          { description: 'b', durationSeconds: 30 },
          { description: 'c', durationSeconds: 10 },
        ],
      }),
    ).toBe(60);
  });
});

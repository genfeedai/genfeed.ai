import { resolveToolKnowledgeSelection } from '@api/services/agent-orchestrator/tools/agent-media-text-generation.service';
import { KnowledgeSourcePurpose } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('resolveToolKnowledgeSelection', () => {
  it('prefers explicit tool parameters and drops unknown purposes', () => {
    expect(
      resolveToolKnowledgeSelection(
        {
          knowledgePurposes: ['BRAND_TRUTH', 'bogus'],
          knowledgeSourceIds: ['s1', '', 7],
        },
        { knowledgeSelection: { spaceIds: ['space'] } },
      ),
    ).toEqual({
      purposes: [KnowledgeSourcePurpose.BRAND_TRUTH],
      sourceIds: ['s1'],
    });
  });

  it('falls back to the turn selection from the composer', () => {
    const selection = { spaceIds: ['space'] };
    expect(
      resolveToolKnowledgeSelection({}, { knowledgeSelection: selection }),
    ).toBe(selection);
    expect(resolveToolKnowledgeSelection({}, {})).toBeUndefined();
  });
});

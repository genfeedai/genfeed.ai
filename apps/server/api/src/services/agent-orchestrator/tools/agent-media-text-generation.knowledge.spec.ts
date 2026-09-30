import { resolveToolKnowledgeSelection } from '@api/services/agent-orchestrator/tools/agent-media-text-generation.service';
import { KnowledgeSourcePurpose } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('resolveToolKnowledgeSelection', () => {
  it('uses tool parameters when the user made no selection, dropping unknown purposes', () => {
    expect(
      resolveToolKnowledgeSelection(
        {
          knowledgePurposes: ['BRAND_TRUTH', 'bogus'],
          knowledgeSourceIds: ['s1', '', 7],
        },
        { knowledgeSelection: {} },
      ),
    ).toEqual({
      purposes: [KnowledgeSourcePurpose.BRAND_TRUTH],
      sourceIds: ['s1'],
    });
  });

  it("never lets tool parameters replace the user's selection", () => {
    const selection = { sourceIds: ['user-picked'] };
    expect(
      resolveToolKnowledgeSelection(
        { knowledgePurposes: ['BRAND_TRUTH'], knowledgeSourceIds: ['other'] },
        { knowledgeSelection: selection },
      ),
    ).toBe(selection);
  });

  it('falls back to the turn selection from the composer', () => {
    const selection = { spaceIds: ['space'] };
    expect(
      resolveToolKnowledgeSelection({}, { knowledgeSelection: selection }),
    ).toBe(selection);
    expect(resolveToolKnowledgeSelection({}, {})).toBeUndefined();
  });
});

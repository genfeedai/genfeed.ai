import { describe, expect, it } from 'vitest';
import {
  buildMediaPromptFromHarness,
  isVisualContentKind,
  selectMediaKnowledgeSources,
} from '../src/media-prompt';
import type { ContentHarnessBrief } from '../src/types';

function brief(
  partial: Partial<ContentHarnessBrief> & Pick<ContentHarnessBrief, 'metadata'>,
): ContentHarnessBrief {
  return {
    appliedPacks: ['core-baseline'],
    evaluationCriteria: [],
    guardrails: [],
    packs: ['core-baseline'],
    providerHints: [],
    sources: [],
    styleDirectives: [],
    systemDirectives: [],
    ...partial,
  };
}

describe('buildMediaPromptFromHarness', () => {
  it('returns the user prompt when no brief is provided', () => {
    expect(buildMediaPromptFromHarness('neon skyline', null)).toBe(
      'neon skyline',
    );
  });

  it('appends brand directives after the operator prompt for visual kinds', () => {
    const result = buildMediaPromptFromHarness(
      'product on marble table',
      brief({
        guardrails: ['Do not look like stock AI slop.'],
        metadata: {
          brandName: 'genfeed.ai',
          contentType: 'image',
          objective: 'awareness',
        },
        sources: [
          {
            content: 'Ship the OS, not another wrapper.',
            id: 'ex-1',
            kind: 'brand_example',
          },
        ],
        styleDirectives: ['Prefer premium product-led visuals.'],
        systemDirectives: ['Write as genfeed.ai.'],
      }),
    );

    expect(result.startsWith('product on marble table')).toBe(true);
    expect(result).toContain('visual generation');
    expect(result).toContain('Write as genfeed.ai.');
    expect(result).toContain('Prefer premium product-led visuals.');
    expect(result).toContain('[brand_example]');
    expect(result).toContain('Do not look like stock AI slop.');
  });

  it('marks image, video, ad-creative, and ugc as visual kinds', () => {
    expect(isVisualContentKind('image')).toBe(true);
    expect(isVisualContentKind('video')).toBe(true);
    expect(isVisualContentKind('ad-creative')).toBe(true);
    expect(isVisualContentKind('ugc')).toBe(true);
    expect(isVisualContentKind('post')).toBe(false);
  });
});

describe('media prompt Knowledge', () => {
  const citation = {
    kind: 'TEXT',
    purpose: 'BRAND_TRUTH',
    sourceId: 'source-1',
    title: 'Brand facts',
    version: 2,
    versionId: 'version-2',
  };
  const knowledgeBrief = brief({
    metadata: { contentType: 'image', objective: 'awareness' },
    sources: [
      {
        content: 'Our mascot is a teal heron named Pim.',
        id: 'knowledge-1',
        kind: 'brand_voice',
        metadata: { citation, relevance: 0.55 },
      },
      {
        content: 'Ship the OS, not another wrapper.',
        id: 'ex-1',
        kind: 'brand_example',
      },
    ],
  });

  it('folds cited Knowledge of every purpose into the prompt once', () => {
    const result = buildMediaPromptFromHarness('mascot poster', knowledgeBrief);

    expect(result).toContain('Brand knowledge:');
    expect(result).toContain('- Our mascot is a teal heron named Pim.');
    expect(result.match(/teal heron/g)).toHaveLength(1);
    expect(result).toContain('[brand_example] Ship the OS');
  });

  it('selects only cited sources, bounded and trimmed as prompted', () => {
    const long = 'x'.repeat(400);
    const selected = selectMediaKnowledgeSources(
      brief({
        metadata: { contentType: 'image', objective: 'awareness' },
        sources: Array.from({ length: 6 }, (_, index) => ({
          content: long,
          id: `knowledge-${index}`,
          kind: 'brand_example' as const,
          metadata: { citation },
        })),
      }),
    );

    expect(selected).toHaveLength(4);
    expect(selected[0]?.content).toHaveLength(300);
    expect(selectMediaKnowledgeSources(knowledgeBrief)).toEqual([
      expect.objectContaining({ id: 'knowledge-1' }),
    ]);
  });
});

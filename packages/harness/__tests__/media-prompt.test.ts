import { describe, expect, it } from 'vitest';
import {
  buildMediaPromptFromHarness,
  isVisualContentKind,
} from '../src/media-prompt';
import type { ContentHarnessBrief } from '../src/types';

function brief(
  partial: Partial<ContentHarnessBrief> & Pick<ContentHarnessBrief, 'metadata'>,
): ContentHarnessBrief {
  return {
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

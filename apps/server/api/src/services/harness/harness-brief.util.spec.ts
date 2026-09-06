import { formatHarnessBrief } from '@api/services/harness/harness-brief.util';
import type { ContentHarnessBrief } from '@genfeedai/harness';
import { describe, expect, it } from 'vitest';

function brief(sources: ContentHarnessBrief['sources']): ContentHarnessBrief {
  return {
    evaluationCriteria: [],
    guardrails: [],
    metadata: { contentType: 'post', objective: 'engagement' },
    packs: [],
    providerHints: [],
    sources,
    styleDirectives: [],
    systemDirectives: [],
  };
}

function cited(purpose: string, content: string) {
  return {
    content,
    id: `k-${purpose}`,
    kind: 'brand_voice' as const,
    metadata: {
      citation: {
        kind: 'URL',
        purpose,
        sourceId: 's',
        title: 'Pricing',
        version: 1,
        versionId: 'v',
      },
    },
    source: `Pricing · ${purpose}`,
  };
}

describe('formatHarnessBrief', () => {
  it('separates cited Knowledge by purpose and keeps uncited memory as signals', () => {
    const text = formatHarnessBrief(
      brief([
        cited('BRAND_TRUTH', 'Plans start at $29'),
        cited('INSPIRATION', 'Punchy competitor hook'),
        cited('RESEARCH', 'Market grew 12%'),
        {
          content: 'Legacy winner',
          id: 'legacy',
          kind: 'performance_winner',
          source: 'winners',
        },
      ]),
    );

    const order = [
      'BRAND FACTS',
      'STYLE REFERENCES',
      'RESEARCH NOTES',
      'REFERENCE SIGNALS',
    ].map((heading) => text.indexOf(heading));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain('treat as authoritative');
    expect(text).toContain(
      'Plans start at $29 (source: Pricing · BRAND_TRUTH)',
    );
    expect(text).toContain(
      '[performance_winner] Legacy winner (source: winners)',
    );
  });

  it('omits every Knowledge section when nothing is cited', () => {
    const text = formatHarnessBrief(brief([]));
    expect(text).not.toContain('BRAND FACTS');
    expect(text).not.toContain('REFERENCE SIGNALS');
  });
});

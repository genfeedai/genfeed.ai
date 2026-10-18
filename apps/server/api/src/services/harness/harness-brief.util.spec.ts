import {
  buildHarnessInput,
  formatHarnessBrief,
} from '@api/services/harness/harness-brief.util';
import { createDefaultBrandPublishPolicy } from '@genfeedai/contracts/api-types/contracts/brand-publish-policy.contract';
import type { IBrandOsRevision } from '@genfeedai/contracts/interfaces';
import type { ContentHarnessBrief } from '@genfeedai/harness';
import { buildBrandKitDraftFromBrand } from '@genfeedai/helpers';
import { describe, expect, it } from 'vitest';

function brief(sources: ContentHarnessBrief['sources']): ContentHarnessBrief {
  return {
    appliedPacks: [],
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

describe('buildHarnessInput approved Brand OS Policy (#7339)', () => {
  function revision(policy?: IBrandOsRevision['content']['policy']) {
    return {
      content: {
        ...buildBrandKitDraftFromBrand({ id: 'brand-1', label: 'Acme' }),
        ...(policy ? { policy } : {}),
      },
      id: 'rev-1',
    } as IBrandOsRevision;
  }
  const intent = { contentType: 'post', objective: 'engagement' } as const;

  it('turns the Policy lists into prompt guardrails', () => {
    const input = buildHarnessInput({
      brandOsRevision: revision({
        ...createDefaultBrandPublishPolicy(),
        bannedClaims: ['Cures anxiety'],
        bannedPhrases: ['game changer'],
        bannedTopics: ['Politics'],
      }),
      intent,
      organizationId: 'org-1',
    });

    expect(input.identityContribution?.guardrails).toEqual([
      'Do not discuss: Politics',
      'Never claim: Cures anxiety',
      'Never write: game changer',
    ]);
  });

  it('adds no guardrails without a Policy or with empty lists', () => {
    for (const brandOsRevision of [
      revision(),
      revision(createDefaultBrandPublishPolicy()),
    ])
      expect(
        buildHarnessInput({ brandOsRevision, intent, organizationId: 'org-1' })
          .identityContribution,
      ).not.toHaveProperty('guardrails');
  });
});

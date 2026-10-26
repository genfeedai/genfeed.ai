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

  it('keeps rejected drafts in the brief when brand examples fill the signal cap', () => {
    const good = Array.from({ length: 6 }, (_, index) => ({
      content: `Approved ${index}`,
      id: `good-${index}`,
      kind: 'brand_example' as const,
      source: 'Brand harness',
    }));
    const avoid = Array.from({ length: 10 }, (_, index) => ({
      content: `Rejected ${index}`,
      id: `avoid-${index}`,
      kind: 'anti_example' as const,
      source: 'Brand harness',
    }));

    const text = formatHarnessBrief(brief([...good, ...avoid]));

    expect(text).toContain('AVOID (drafts reviewers rejected');
    // Newest eight of the ten, oldest dropped.
    expect(text).toContain('Rejected 9');
    expect(text).toContain('Rejected 2');
    expect(text).not.toContain('Rejected 1 ');
    expect(text).not.toContain('Rejected 0 ');
    // Brand examples stay under the shared cap of five.
    expect(text).toContain('Approved 4');
    expect(text).not.toContain('Approved 5');
    expect(text.indexOf('AVOID')).toBeLessThan(
      text.indexOf('REFERENCE SIGNALS'),
    );
  });

  it('omits the avoid section when nothing was rejected', () => {
    expect(formatHarnessBrief(brief([]))).not.toContain('AVOID');
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
  it('projects approved music guidance and voice without draft or typed visual/strategy fields', () => {
    const approved = revision({
      ...createDefaultBrandPublishPolicy(),
      bannedPhrases: ['forbidden lyric'],
    });
    approved.content = {
      ...buildBrandKitDraftFromBrand({
        id: 'brand-1',
        label: 'Acme',
        text: 'approved sound',
        description: 'VISUAL_DESCRIPTION',
        primaryColor: '#abcdef',
        agentConfig: {
          voice: { tone: 'approved warmth' },
          strategy: { goals: ['STRATEGY_SENTINEL'] },
        },
      }),
      policy: approved.content.policy,
    };
    const draft = {
      id: 'brand-1',
      label: 'Draft',
      text: 'DRAFT_GUIDANCE',
      description: '',
      primaryColor: '',
      secondaryColor: '',
      agentConfig: { voice: { tone: 'DRAFT_VOICE' } },
    };
    const input = buildHarnessInput({
      brand: draft,
      brandOsRevision: approved,
      intent: { contentType: 'music', objective: 'awareness' },
      organizationId: 'org-1',
    });
    const projection = JSON.stringify(input.identityContribution);
    expect(projection).toContain('approved sound');
    expect(input.voiceProfile?.tone).toBe('approved warmth');
    expect(projection).toContain('forbidden lyric');
    expect(projection).not.toMatch(
      /VISUAL_DESCRIPTION|abcdef|STRATEGY_SENTINEL|DRAFT/,
    );
    delete approved.content.fields.promptGuidelines;
    delete approved.content.fields.voiceTone;
    const missing = buildHarnessInput({
      brand: draft,
      brandOsRevision: approved,
      intent: { contentType: 'music', objective: 'awareness' },
      organizationId: 'org-1',
    });
    expect(JSON.stringify(missing)).not.toMatch(/DRAFT_GUIDANCE|DRAFT_VOICE/);
    const fallback = buildHarnessInput({
      brand: draft,
      intent: { contentType: 'music', objective: 'awareness' },
      organizationId: 'org-1',
    });
    expect(fallback.identityContribution?.systemDirectives).toEqual([
      'DRAFT_GUIDANCE',
    ]);
    expect(fallback.voiceProfile?.tone).toBe('DRAFT_VOICE');
    for (const contentType of ['image', 'video', 'post'] as const) {
      const control = buildHarnessInput({
        brandOsRevision: approved,
        intent: { contentType, objective: 'awareness' },
        organizationId: 'org-1',
      });
      expect(JSON.stringify(control.identityContribution)).toContain(
        'VISUAL_DESCRIPTION',
      );
      expect(JSON.stringify(control.identityContribution)).toContain('#abcdef');
    }
  });
});

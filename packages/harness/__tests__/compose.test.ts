import { describe, expect, it } from 'vitest';
import { composeContentHarnessBrief } from '../src/compose';
import { CORE_CONTENT_HARNESS_PACK } from '../src/defaults';
import { ContentHarnessRegistry } from '../src/registry';
import type {
  ContentHarnessContribution,
  ContentHarnessInput,
  ContentHarnessPack,
} from '../src/types';

const BASE_INPUT: ContentHarnessInput = {
  brandId: 'brand-1',
  brandName: 'Acme',
  intent: {
    contentType: 'post',
    objective: 'engagement',
    platform: 'linkedin',
  },
};

function buildPack(
  id: string,
  contribution?: ContentHarnessContribution,
): ContentHarnessPack {
  return {
    contribute: contribution ? () => contribution : undefined,
    id,
    version: '1.0.0',
  };
}

describe('composeContentHarnessBrief', () => {
  it('returns an empty brief with metadata for an empty registry', async () => {
    const registry = new ContentHarnessRegistry();

    const brief = await composeContentHarnessBrief(registry, BASE_INPUT);

    expect(brief.packs).toEqual([]);
    expect(brief.systemDirectives).toEqual([]);
    expect(brief.styleDirectives).toEqual([]);
    expect(brief.guardrails).toEqual([]);
    expect(brief.evaluationCriteria).toEqual([]);
    expect(brief.providerHints).toEqual([]);
    expect(brief.sources).toEqual([]);
    expect(brief.metadata).toEqual({
      brandId: 'brand-1',
      brandName: 'Acme',
      contentType: 'post',
      objective: 'engagement',
      platform: 'linkedin',
    });
  });

  it('skips packs without a contribute function but still lists them', async () => {
    const registry = new ContentHarnessRegistry();
    registry.registerPack(buildPack('inert'));
    registry.registerPack(
      buildPack('active', { systemDirectives: ['Directive.'] }),
    );

    const brief = await composeContentHarnessBrief(registry, BASE_INPUT);

    expect(brief.packs).toEqual(['inert', 'active']);
    expect(brief.systemDirectives).toEqual(['Directive.']);
  });

  it('merges contributions from multiple packs with trimming and dedupe', async () => {
    const registry = new ContentHarnessRegistry();
    registry.registerPack(
      buildPack('one', {
        evaluationCriteria: ['Criterion A.'],
        guardrails: ['Guardrail A.'],
        providerHints: ['Hint A.'],
        sources: [{ content: 'a', id: 'src-1', kind: 'brand_voice' }],
        styleDirectives: ['Style A.'],
        systemDirectives: ['System A.', 'Shared directive.'],
      }),
    );
    registry.registerPack(
      buildPack('two', {
        evaluationCriteria: ['Criterion A.', 'Criterion B.'],
        guardrails: ['  Guardrail A.  ', 'Guardrail B.'],
        providerHints: ['Hint B.'],
        sources: [
          { content: 'duplicate', id: 'src-1', kind: 'brand_voice' },
          { content: 'b', id: 'src-2', kind: 'anti_example' },
        ],
        styleDirectives: ['Style B.', '   '],
        systemDirectives: ['Shared directive.', 'System B.'],
      }),
    );

    const brief = await composeContentHarnessBrief(registry, BASE_INPUT);

    expect(brief.systemDirectives).toEqual([
      'System A.',
      'Shared directive.',
      'System B.',
    ]);
    expect(brief.styleDirectives).toEqual(['Style A.', 'Style B.']);
    expect(brief.guardrails).toEqual(['Guardrail A.', 'Guardrail B.']);
    expect(brief.evaluationCriteria).toEqual(['Criterion A.', 'Criterion B.']);
    expect(brief.providerHints).toEqual(['Hint A.', 'Hint B.']);
    expect(brief.sources.map((source) => source.id)).toEqual([
      'src-1',
      'src-2',
    ]);
    expect(brief.sources[0]?.content).toBe('a');
  });

  it('supports async pack contributions', async () => {
    const registry = new ContentHarnessRegistry();
    registry.registerPack({
      contribute: () => Promise.resolve({ providerHints: ['Async hint.'] }),
      id: 'async-pack',
      version: '1.0.0',
    });

    const brief = await composeContentHarnessBrief(registry, BASE_INPUT);

    expect(brief.providerHints).toEqual(['Async hint.']);
  });

  it('handles contributions with omitted fields', async () => {
    const registry = new ContentHarnessRegistry();
    registry.registerPack(buildPack('sparse', {}));

    const brief = await composeContentHarnessBrief(registry, BASE_INPUT);

    expect(brief.systemDirectives).toEqual([]);
    expect(brief.sources).toEqual([]);
  });

  it('composes the core baseline pack end to end', async () => {
    const registry = new ContentHarnessRegistry();
    registry.registerPack(CORE_CONTENT_HARNESS_PACK);

    const brief = await composeContentHarnessBrief(registry, {
      ...BASE_INPUT,
      voiceProfile: { tone: 'bold' },
    });

    expect(brief.packs).toEqual(['core-baseline']);
    expect(brief.systemDirectives[0]).toContain('Write as Acme.');
    expect(brief.styleDirectives).toContain('Tone: bold.');
    expect(brief.guardrails.length).toBeGreaterThan(0);
  });
});

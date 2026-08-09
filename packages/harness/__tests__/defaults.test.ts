import { describe, expect, it } from 'vitest';
import { CORE_CONTENT_HARNESS_PACK } from '../src/defaults';
import type {
  ContentHarnessContribution,
  ContentHarnessInput,
} from '../src/types';

function contribute(input: ContentHarnessInput): ContentHarnessContribution {
  const result = CORE_CONTENT_HARNESS_PACK.contribute?.(input);

  if (!result || result instanceof Promise) {
    throw new Error('Expected a synchronous contribution');
  }

  return result;
}

describe('CORE_CONTENT_HARNESS_PACK', () => {
  it('declares its pack identity', () => {
    expect(CORE_CONTENT_HARNESS_PACK.id).toBe('core-baseline');
    expect(CORE_CONTENT_HARNESS_PACK.version).toBe('1.0.0');
    expect(CORE_CONTENT_HARNESS_PACK.capabilities).toContain('brand-voice');
    expect(CORE_CONTENT_HARNESS_PACK.description).toBeTruthy();
  });

  it('produces baseline guardrails and evaluation criteria for a minimal input', () => {
    const contribution = contribute({
      intent: { contentType: 'post', objective: 'awareness' },
    });

    expect(contribution.systemDirectives).toEqual([]);
    expect(contribution.styleDirectives).toEqual([]);
    expect(contribution.providerHints).toEqual([]);
    expect(contribution.sources).toEqual([]);
    expect(contribution.guardrails).toEqual([
      'Avoid bland, generic, over-explained AI phrasing.',
      'Prefer specificity, concrete claims, and lived-in language.',
    ]);
    expect(contribution.evaluationCriteria).toEqual([
      'Brand fidelity: the output should be recognizably native to the brand.',
      'Objective fit: the output should optimize for awareness.',
      'Platform fit: the output should read naturally on the target platform.',
      'Format fit: the output should satisfy the constraints of a post.',
    ]);
  });

  it('mentions the platform in evaluation criteria when provided', () => {
    const contribution = contribute({
      intent: {
        contentType: 'thread',
        objective: 'engagement',
        platform: 'twitter',
      },
    });

    expect(contribution.evaluationCriteria).toContain(
      'Platform fit: the output should read naturally on twitter.',
    );
  });

  it('builds system directives from brand, topic, and offer', () => {
    const contribution = contribute({
      brandName: 'Acme',
      intent: {
        contentType: 'article',
        objective: 'authority',
        offer: 'free trial',
        topic: 'AI content',
      },
    });

    expect(contribution.systemDirectives).toEqual([
      'Write as Acme. The output should feel native to the brand, not like generic AI copy.',
      'Stay focused on the topic: AI content.',
      'Keep the offer grounded in the real value proposition: free trial.',
    ]);
  });

  it('builds style directives, guardrails, and hints from voice and persona profiles', () => {
    const contribution = contribute({
      intent: { contentType: 'email', objective: 'conversion' },
      personaProfile: {
        label: ' Founder voice ',
        topics: ['bootstrapping', 'ai'],
      },
      voiceProfile: {
        audience: ['founders', 'creators'],
        doNotSoundLike: ['corporate PR'],
        messagingPillars: ['ship fast'],
        sampleOutput: '  We ship on Fridays.  ',
        style: 'direct',
        tone: 'bold',
        values: ['craft'],
      },
    });

    expect(contribution.styleDirectives).toEqual([
      'Tone: bold.',
      'Writing style: direct.',
      'Primary audience: founders, creators.',
      'Center the message around: ship fast.',
      'Reflect these brand values: craft.',
      'Persona anchor: Founder voice.',
      'Persona topic territory: bootstrapping, ai.',
    ]);
    expect(contribution.guardrails?.[0]).toBe(
      'Do not sound like: corporate PR.',
    );
    expect(contribution.providerHints).toEqual([
      'Sample voice reference: We ship on Fridays.',
    ]);
  });

  it('skips trim-checked blanks and empty profile lists', () => {
    const contribution = contribute({
      intent: { contentType: 'reply', objective: 'retention' },
      personaProfile: { label: '  ', topics: [] },
      voiceProfile: {
        audience: [],
        doNotSoundLike: [],
        messagingPillars: [],
        sampleOutput: '   ',
        values: [],
      },
    });

    expect(contribution.systemDirectives).toEqual([]);
    expect(contribution.styleDirectives).toEqual([]);
    expect(contribution.providerHints).toEqual([]);
  });

  it('still emits directives for whitespace-only brand and tone (truthiness, not trim, gates them)', () => {
    // Documents current behavior: brandName/topic/offer/tone/style are gated on
    // raw truthiness, so whitespace-only values produce a directive with a
    // blank interpolation. Only persona label and sampleOutput are trim-gated.
    const contribution = contribute({
      brandName: '   ',
      intent: { contentType: 'reply', objective: 'retention' },
      voiceProfile: { tone: '  ' },
    });

    expect(contribution.systemDirectives).toHaveLength(1);
    expect(contribution.systemDirectives?.[0]).toContain('Write as');
    expect(contribution.styleDirectives).toEqual(['Tone:   .']);
  });

  it('appends profile contribution values and merges sources', () => {
    const contribution = contribute({
      intent: { contentType: 'script', objective: 'awareness' },
      profileContribution: {
        evaluationCriteria: ['Custom criterion.'],
        guardrails: ['Never use emoji.'],
        providerHints: ['Prefer short sentences.'],
        sources: [
          { content: 'profile source', id: 'src-2', kind: 'brand_example' },
        ],
        styleDirectives: ['Use short hooks.'],
        systemDirectives: ['Always cite sources.', '   '],
      },
      sources: [{ content: 'input source', id: 'src-1', kind: 'brand_voice' }],
    });

    expect(contribution.systemDirectives).toEqual(['Always cite sources.']);
    expect(contribution.styleDirectives).toEqual(['Use short hooks.']);
    expect(contribution.guardrails).toContain('Never use emoji.');
    expect(contribution.evaluationCriteria).toContain('Custom criterion.');
    expect(contribution.providerHints).toEqual(['Prefer short sentences.']);
    expect(contribution.sources?.map((source) => source.id)).toEqual([
      'src-1',
      'src-2',
    ]);
  });
});

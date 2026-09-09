import { describe, expect, it } from 'vitest';
import {
  PERSUASION_LAYERS,
  PERSUASION_SCORE_KEYS,
  VIRAL_PSYCHOLOGY_HARNESS_PACK,
} from '../src/persuasion/viral-psychology';
import type {
  ContentHarnessContribution,
  ContentHarnessInput,
} from '../src/types';

function contribute(input: ContentHarnessInput): ContentHarnessContribution {
  const result = VIRAL_PSYCHOLOGY_HARNESS_PACK.contribute?.(input);
  if (!result || result instanceof Promise) {
    throw new Error('Expected a synchronous contribution');
  }
  return result;
}

describe('VIRAL_PSYCHOLOGY_HARNESS_PACK', () => {
  it('contributes one evaluation criterion per persuasion layer', () => {
    const contribution = contribute({
      intent: { contentType: 'post', objective: 'engagement', platform: 'x' },
    });

    expect(VIRAL_PSYCHOLOGY_HARNESS_PACK.id).toBe('viral-psychology');
    expect(contribution.evaluationCriteria).toEqual(
      PERSUASION_LAYERS.map((layer) => layer.criterion),
    );
    expect(PERSUASION_SCORE_KEYS).toEqual([
      'demandFit',
      'hookStrength',
      'openLoopIntegrity',
      'ctaNaturalness',
    ]);
  });

  it('publishes the score keys as a provider hint', () => {
    const contribution = contribute({
      intent: { contentType: 'post', objective: 'engagement' },
    });

    expect(contribution.providerHints?.join(' ')).toContain(
      'demandFit, hookStrength, openLoopIntegrity, ctaNaturalness',
    );
  });

  it('contributes regardless of platform, unlike the X pack', () => {
    const contribution = contribute({
      intent: { contentType: 'newsletter', objective: 'awareness' },
    });

    expect(contribution.systemDirectives?.length).toBeGreaterThan(0);
    expect(contribution.guardrails?.length).toBeGreaterThan(0);
  });

  it('adds a first-three-seconds directive for short form only', () => {
    const shortForm = contribute({
      intent: { contentType: 'video', objective: 'awareness' },
    });
    const longForm = contribute({
      intent: { contentType: 'article', objective: 'awareness' },
    });

    expect(shortForm.styleDirectives?.join(' ')).toContain(
      'first three seconds',
    );
    expect(longForm.styleDirectives?.join(' ')).not.toContain(
      'first three seconds',
    );
    expect(longForm.styleDirectives?.join(' ')).toContain('Re-hook');
  });

  it('sharpens the ask and names the offer for conversion intent', () => {
    const contribution = contribute({
      intent: {
        contentType: 'post',
        objective: 'conversion',
        offer: 'the self-hosted tier',
      },
    });

    expect(contribution.styleDirectives?.join(' ')).toContain('next step');
    expect(contribution.styleDirectives?.join(' ')).toContain(
      'the self-hosted tier',
    );
  });

  it('leaves conversion directives out of non-conversion intent', () => {
    const contribution = contribute({
      intent: {
        contentType: 'post',
        objective: 'engagement',
        offer: 'the self-hosted tier',
      },
    });

    expect(contribution.styleDirectives?.join(' ')).not.toContain(
      'the self-hosted tier',
    );
  });
});

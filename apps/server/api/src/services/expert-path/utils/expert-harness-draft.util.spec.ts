import {
  buildExpertHarnessDraft,
  EXPERT_GENERIC_BANNED_PHRASES,
  EXPERT_HARNESS_DRAFT_SOURCE,
  extractExpertVocabulary,
  splitAnswerItems,
} from '@api/services/expert-path/utils/expert-harness-draft.util';
import { scoreExpertPositioning } from '@api/services/expert-path/utils/expert-positioning-score.util';
import type { ExpertPositioningAnswers } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

const ANSWERS: ExpertPositioningAnswers = {
  authoritySignals:
    '- Helped 140 founders fix cash flow\n- Former CFO\n- Featured on the Indie Hackers podcast',
  bigDomino:
    'If founders believe cash flow is designed, not reported, every other objection stops mattering.',
  contrarianBeliefs:
    'Most founders think a fractional CFO fixes cash flow. Monthly reports explain the past, not the cash flow ritual.',
  newOpportunity: 'Stop reading monthly reports; run a weekly cash ritual.',
  notForWho: 'Venture-backed teams burning cash on purpose.',
  originStory:
    'I used to run finance at a startup that nearly went bankrupt. That is when I realized cash flow is designed.',
  transformation: 'Founders go from dreading the balance to deciding with it.',
};

describe('splitAnswerItems', () => {
  it('splits bullet lines and strips markers', () => {
    expect(splitAnswerItems('- one\n* two\n3. three')).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  it('splits a single paragraph into sentences', () => {
    expect(splitAnswerItems('First point. Second point!')).toEqual([
      'First point.',
      'Second point!',
    ]);
  });

  it('returns nothing for blank input', () => {
    expect(splitAnswerItems('  ')).toEqual([]);
    expect(splitAnswerItems(undefined)).toEqual([]);
  });
});

describe('extractExpertVocabulary', () => {
  it('keeps repeated distinctive words in frequency order', () => {
    const vocabulary = extractExpertVocabulary(ANSWERS);

    expect(vocabulary[0]).toBe('founders');
    expect(vocabulary).toContain('ritual');
    expect(vocabulary).not.toContain('believe');
  });
});

describe('buildExpertHarnessDraft', () => {
  const score = scoreExpertPositioning(
    ANSWERS,
    new Date('2026-09-19T00:00:00.000Z'),
  );

  it('maps positioning answers onto thesis, voice, and guardrails', () => {
    const draft = buildExpertHarnessDraft({
      answers: ANSWERS,
      brandId: 'brand-1',
      brandLabel: 'Cash Design',
      generatedAt: new Date('2026-09-19T00:00:00.000Z'),
      platforms: ['linkedin'],
      score,
      voice: {
        audience: ['Bootstrapped founders'],
        doNotSoundLike: ['Corporate finance jargon'],
        messagingPillars: ['Cash is a product surface'],
        style: 'Short, concrete, numbers first',
        tone: 'Direct',
      },
    });

    expect(draft).toMatchObject({
      audience: ['Bootstrapped founders'],
      brandId: 'brand-1',
      isDefault: true,
      label: 'Cash Design expert voice',
      metadata: {
        generatedAt: '2026-09-19T00:00:00.000Z',
        source: EXPERT_HARNESS_DRAFT_SOURCE,
      },
      platforms: ['linkedin'],
      positioning: score,
      scope: 'founder',
      status: 'active',
    });
    expect(draft.thesis.bigDomino).toEqual([ANSWERS.bigDomino]);
    expect(draft.thesis.beliefs).toEqual([
      ANSWERS.bigDomino,
      'Cash is a product surface',
    ]);
    expect(draft.thesis.originStory).toEqual([ANSWERS.originStory]);
    expect(draft.thesis.proofPoints).toEqual([
      'Helped 140 founders fix cash flow',
      'Former CFO',
      'Featured on the Indie Hackers podcast',
    ]);
    expect(draft.thesis.enemies).toHaveLength(2);
    expect(draft.thesis.notFor).toEqual([ANSWERS.notForWho]);
    expect(draft.voice.tone).toBe('Direct');
    expect(draft.voice.style).toBe('Short, concrete, numbers first');
    expect(draft.voice.stance).toContain(ANSWERS.bigDomino);
    expect(draft.voice.bannedPhrases).toEqual([
      'Corporate finance jargon',
      ...EXPERT_GENERIC_BANNED_PHRASES,
    ]);
    expect(draft.guardrails).toContain(`Not written for: ${ANSWERS.notForWho}`);
  });

  it('omits tone and style when the interview never captured them', () => {
    const draft = buildExpertHarnessDraft({
      answers: {},
      brandId: 'brand-1',
      brandLabel: 'Acme',
      platforms: [],
      score: scoreExpertPositioning({}),
      voice: {},
    });

    expect(draft.voice).not.toHaveProperty('tone');
    expect(draft.voice).not.toHaveProperty('style');
    expect(draft.thesis.bigDomino).toEqual([]);
    expect(draft.voice.stance).toContain('take a clear position');
  });
});

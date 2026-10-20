import { ONBOARDING_BUTTON_CARDS } from '@api/services/agent-orchestrator/constants/onboarding-conversation-flow.constant';
import { ONBOARDING_ANSWER_FIELD_IDS } from '@genfeedai/contracts/types';
import { describe, expect, it } from 'vitest';

describe('onboarding button card contract', () => {
  it('asks the cards in the approved order', () => {
    expect(ONBOARDING_BUTTON_CARDS.map((card) => card.title)).toEqual([
      'Goal',
      'Audience',
      'Offer',
      'Competitors',
      'Platforms',
      'Tone',
      'Cadence',
    ]);
    expect(ONBOARDING_BUTTON_CARDS.map((card) => card.field)).toEqual(
      ONBOARDING_ANSWER_FIELD_IDS,
    );
  });

  it.each(ONBOARDING_BUTTON_CARDS)(
    '$title has at most 5 options with Skip last',
    (card) => {
      for (const options of [card.options, card.fallbackOptions ?? []]) {
        if (options.length === 0) continue;
        expect(options.length).toBeLessThanOrEqual(5);
        expect(options.at(-1)).toEqual({ id: 'skip', label: 'Skip' });
        expect(new Set(options.map((option) => option.id)).size).toBe(
          options.length,
        );
      }
      if (card.suggestionSource)
        expect((card.maxSuggestions ?? 0) + 1).toBeLessThanOrEqual(5);
      if (card.isMultiSelect)
        expect(card.maxSelections).toBeLessThanOrEqual(
          card.suggestionSource
            ? (card.maxSuggestions ?? 0)
            : card.options.length - 1,
        );
    },
  );

  it('caps the intel cards as approved and sources them from the scan', () => {
    const byField = Object.fromEntries(
      ONBOARDING_BUTTON_CARDS.map((card) => [card.field, card]),
    );
    expect(byField.audience).toMatchObject({
      isMultiSelect: true,
      maxSelections: 2,
      suggestionSource: 'audiences',
    });
    expect(byField.offer).toMatchObject({
      isMultiSelect: false,
      suggestionSource: 'offers',
    });
    expect(byField.competitors).toMatchObject({
      isMultiSelect: true,
      maxSelections: 3,
      suggestionSource: 'competitors',
    });
    expect(byField.competitors?.fallbackOptions).toBeUndefined();
  });

  it('warns before skipping only audience, offer and competitors', () => {
    expect(
      ONBOARDING_BUTTON_CARDS.filter((card) => card.skipWarning).map((card) => [
        card.field,
        card.skipWarning,
      ]),
    ).toEqual([
      [
        'audience',
        'Without an audience, posts talk to everyone and land with no one.',
      ],
      ['offer', 'Without an offer, calls to action stay vague.'],
      [
        'competitors',
        "Without competitors, I can't position you against them or track their ads and trends.",
      ],
    ]);
  });

  it('offers Learn from my Instagram on Tone', () => {
    const tone = ONBOARDING_BUTTON_CARDS.find((card) => card.field === 'tone');
    expect(tone?.options.map((option) => option.id)).toEqual([
      'keep',
      'casual',
      'professional',
      'learn_from_instagram',
      'skip',
    ]);
  });
});

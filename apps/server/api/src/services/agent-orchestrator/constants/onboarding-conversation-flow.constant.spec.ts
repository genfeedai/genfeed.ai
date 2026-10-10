import {
  ONBOARDING_BUTTON_CARDS,
  ONBOARDING_CONVERSATION_FLOW,
  ONBOARDING_SKIP_CONFIRMATION_OPTIONS,
} from '@api/services/agent-orchestrator/constants/onboarding-conversation-flow.constant';
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
    const rendered = ONBOARDING_BUTTON_CARDS.map((card) =>
      ONBOARDING_CONVERSATION_FLOW.indexOf(
        `. ${card.title} (field: ${card.field})`,
      ),
    );
    expect(rendered.every((index) => index > 0)).toBe(true);
    expect(rendered).toEqual([...rendered].sort((a, b) => a - b));
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
    // A scan can return fewer suggestions than the card's limit, and
    // request_input rejects maxSelections above the options shown.
    for (const card of [byField.audience, byField.competitors])
      expect(ONBOARDING_CONVERSATION_FLOW).toContain(
        `${card?.title} (field: ${card?.field}): isMultiSelect: true, maxSelections: the smaller of ${card?.maxSelections} and the number of suggestions shown (not counting Skip)`,
      );
    expect(ONBOARDING_CONVERSATION_FLOW).toContain(
      'Goal (field: goals): isMultiSelect: true, maxSelections: 3.',
    );
    expect(ONBOARDING_CONVERSATION_FLOW).toContain(
      'data.summary.suggestions.audiences',
    );
    expect(ONBOARDING_CONVERSATION_FLOW).toContain(
      'never invent options the scan did not return',
    );
    expect(ONBOARDING_CONVERSATION_FLOW).toContain(
      'skippedFields: ["competitors"]',
    );
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
    expect(ONBOARDING_SKIP_CONFIRMATION_OPTIONS).toEqual([
      { id: 'skip_confirmed', label: 'Skip anyway' },
      { id: 'answer_it', label: 'Answer it (+5 credits)' },
    ]);
    for (const card of ONBOARDING_BUTTON_CARDS.filter(
      (entry) => entry.skipWarning,
    ))
      expect(ONBOARDING_CONVERSATION_FLOW).toContain(`"${card.skipWarning}"`);
    expect(ONBOARDING_CONVERSATION_FLOW).toContain(
      'Skip anyway (id: skip_confirmed), Answer it (+5 credits) (id: answer_it)',
    );
    expect(ONBOARDING_CONVERSATION_FLOW).toContain(
      'Skip on Goal, Platforms, Tone, Cadence: call save_onboarding_answers with skippedFields',
    );
    expect(ONBOARDING_CONVERSATION_FLOW).toContain(
      'answer_it: ask the same card again',
    );
  });

  it('saves after every card and never pays for a skip', () => {
    expect(ONBOARDING_CONVERSATION_FLOW).toContain(
      'Right after each answered card, call save_onboarding_answers with only that field',
    );
    expect(ONBOARDING_CONVERSATION_FLOW).toContain('a skip never does');
    expect(ONBOARDING_CONVERSATION_FLOW).toContain('allowFreeText: false');
  });

  it('offers Learn from my Instagram on Tone through the existing connection flow', () => {
    const tone = ONBOARDING_BUTTON_CARDS.find((card) => card.field === 'tone');
    expect(tone?.options.map((option) => option.id)).toEqual([
      'keep',
      'casual',
      'professional',
      'learn_from_instagram',
      'skip',
    ]);
    for (const rule of [
      'call connect_social_account with platform: instagram',
      'never publishes',
      'call get_connection_status with platform: instagram',
      'toneAdjustment: learn_from_instagram',
      'call draft_brand_voice_profile once',
      'except the Instagram connection the user picks on the Tone card',
    ])
      expect(ONBOARDING_CONVERSATION_FLOW).toContain(rule);
  });
});

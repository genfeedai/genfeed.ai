import { AGENT_ORCHESTRATOR_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/agent-orchestrator-system-prompt.constant';
import { GENFEED_AGENT_BRAND_QUESTION_RULE } from '@api/services/agent-orchestrator/constants/genfeed-agent-identity.constant';
import {
  buildBrandContextAskCard,
  buildMissingBrandContextSection,
  MAX_MISSING_BRAND_CONTEXT_FIELDS,
  MISSING_BRAND_CONTEXT_HEADER,
} from '@api/services/agent-orchestrator/constants/missing-brand-context.constant';
import { ONBOARDING_BUTTON_CARDS } from '@api/services/agent-orchestrator/constants/onboarding-conversation-flow.constant';
import { ONBOARDING_SYSTEM_PROMPT } from '@api/services/agent-orchestrator/constants/onboarding-system-prompt.constant';
import type { IOnboardingScanSuggestions } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

const NO_SUGGESTIONS: IOnboardingScanSuggestions = {
  audiences: [],
  competitors: [],
  offers: [],
};

function onboardingCard(field: string) {
  const card = ONBOARDING_BUTTON_CARDS.find((entry) => entry.field === field);
  if (!card) throw new Error(`No onboarding card for ${field}`);
  return card;
}

describe('buildBrandContextAskCard reuses the onboarding card contract', () => {
  it.each(['goals', 'platforms', 'cadence'])(
    '%s uses the onboarding options unchanged, Skip last',
    (field) => {
      const card = buildBrandContextAskCard(field as 'goals', NO_SUGGESTIONS);
      const source = onboardingCard(field);
      expect(card).toMatchObject({
        field,
        isMultiSelect: source.isMultiSelect,
        options: source.options,
        reason: source.askReason,
        requestId: `brand_context:${field}`,
        save: source.save,
        title: source.title,
      });
      expect(card?.options.at(-1)).toEqual({ id: 'skip', label: 'Skip' });
    },
  );

  it('uses scan suggestions before Skip, as onboarding does', () => {
    const card = buildBrandContextAskCard('audience', {
      ...NO_SUGGESTIONS,
      audiences: ['Gym owners', 'Personal trainers'],
    });
    expect(card).toMatchObject({
      isMultiSelect: true,
      maxSelections: 2,
      options: [
        { id: 'suggested_1', label: 'Gym owners' },
        { id: 'suggested_2', label: 'Personal trainers' },
        { id: 'skip', label: 'Skip' },
      ],
      reason: 'so posts talk to the right people',
    });
  });

  it('caps the selection limit at the suggestions shown', () => {
    const card = buildBrandContextAskCard('competitors', {
      ...NO_SUGGESTIONS,
      competitors: ['Rival'],
    });
    expect(card?.maxSelections).toBe(1);
  });

  it('falls back to the onboarding fallback options without suggestions', () => {
    expect(buildBrandContextAskCard('offer', NO_SUGGESTIONS)?.options).toEqual(
      onboardingCard('offer').fallbackOptions,
    );
  });

  it('skips Competitors without suggestions: there is no button answer', () => {
    expect(buildBrandContextAskCard('competitors', NO_SUGGESTIONS)).toBeNull();
  });

  it('leaves out the tone options that need a scanned voice or a connection', () => {
    expect(
      buildBrandContextAskCard('tone', NO_SUGGESTIONS)?.options.map(
        (option) => option.id,
      ),
    ).toEqual(['casual', 'professional', 'skip']);
  });
});

describe('buildMissingBrandContextSection', () => {
  it('renders nothing without askable fields', () => {
    expect(buildMissingBrandContextSection(undefined)).toBeNull();
    expect(
      buildMissingBrandContextSection({
        fields: [{ field: 'competitors', status: 'missing' }],
        suggestions: NO_SUGGESTIONS,
      }),
    ).toBeNull();
  });

  it('renders at most three askable fields in priority order as exact cards', () => {
    const section = buildMissingBrandContextSection({
      fields: [
        { field: 'audience', status: 'skipped' },
        { field: 'offer', status: 'missing' },
        { field: 'competitors', status: 'missing' },
        { field: 'goals', status: 'missing' },
        { field: 'platforms', status: 'missing' },
      ],
      suggestions: { ...NO_SUGGESTIONS, offers: ['Personal training'] },
    });
    expect(section).toMatchObject({
      header: MISSING_BRAND_CONTEXT_HEADER,
      isAtomic: true,
      untrusted: true,
    });
    const lines = section?.content.split('\n') ?? [];
    expect(lines).toHaveLength(MAX_MISSING_BRAND_CONTEXT_FIELDS);
    expect(lines[0]).toBe(
      '- Audience (field: audience, skipped earlier): requestId: brand_context:audience; isMultiSelect: true, maxSelections: 2; options: Consumers (id: consumers), Small businesses (id: small_businesses), Professionals (id: professionals), Creators (id: creators), Skip (id: skip); reason: "so posts talk to the right people"; save as audience: the chosen labels.',
    );
    expect(lines[1]).toContain(
      'Offer (field: offer, missing): requestId: brand_context:offer; single select; options: Personal training (id: suggested_1), Skip (id: skip)',
    );
    // Competitors has no suggestions, so Goal takes the third slot.
    expect(lines[2]).toContain('Goal (field: goals, missing)');
    expect(section?.content).not.toContain('Platforms');
  });
});

describe('shared missing brand context rule', () => {
  it('lives in the shared identity rule the orchestrator prompt carries', () => {
    expect(AGENT_ORCHESTRATOR_SYSTEM_PROMPT).toContain(
      GENFEED_AGENT_BRAND_QUESTION_RULE,
    );
    expect(ONBOARDING_SYSTEM_PROMPT).not.toContain(
      'Missing Brand Context" section',
    );
  });

  it.each([
    'When a "Missing Brand Context" section lists brand fields',
    'only when it bears on what the user is doing',
    "Do the user's request first and ask after delivering it",
    'never ask first, hold the request back or delay it',
    'Ask at most one listed field per conversation',
    'never again after the user skips it',
    'request_input with its requestId, title, options in order with Skip last',
    'allowFreeText: false',
    'with its reason as the one-line prompt',
    'call save_onboarding_answers with only that field',
    'call it with skippedFields: [that field]',
  ])('states "%s"', (rule) => {
    expect(GENFEED_AGENT_BRAND_QUESTION_RULE).toContain(rule);
  });

  it('never promises an answer reward outside onboarding', () => {
    expect(GENFEED_AGENT_BRAND_QUESTION_RULE.toLowerCase()).not.toContain(
      'credit',
    );
    expect(
      buildMissingBrandContextSection({
        fields: [{ field: 'goals', status: 'missing' }],
        suggestions: NO_SUGGESTIONS,
      })?.content.toLowerCase(),
    ).not.toContain('credit');
  });
});

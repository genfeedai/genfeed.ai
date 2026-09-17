import {
  BrandVoiceValidationError,
  parseGeneratedBrandProfile,
} from '@api/collections/brands/utils/brand-profile-generation.util';
import { BrandVoiceFailureCode } from '@genfeedai/contracts/interfaces';

const response = {
  audience: ['founders', 'operators'],
  doNotSoundLike: ['corporate jargon'],
  goals: ['Increase qualified leads'],
  hashtags: ['genfeed'],
  messagingPillars: ['AI workflows', 'content systems', 'brand consistency'],
  promptSeeds: [
    {
      angle: 'Operational playbook',
      audience: 'founders',
      preferredFormats: ['carousel'],
      topic: 'AI workflows',
    },
    {
      angle: 'Common mistakes',
      audience: 'operators',
      preferredFormats: ['post'],
      topic: 'content systems',
    },
    {
      angle: 'Before and after',
      audience: 'marketers',
      preferredFormats: ['short-video'],
      topic: 'brand consistency',
    },
  ],
  sampleOutput: 'Clear systems beat noisy hustle.',
  style: 'direct',
  taglines: ['Ship with signal'],
  tone: 'confident',
  topics: ['AI workflows', 'content systems', 'brand consistency'],
  values: ['clarity', 'proof'],
};

describe('brand profile generation', () => {
  it('parses one response into a reusable profile with three starters', () => {
    const profile = parseGeneratedBrandProfile(JSON.stringify(response));

    expect(profile.strategy.topics).toEqual(response.topics);
    expect(profile.prompting.seeds).toHaveLength(6);
    expect(profile.prompting.conversationStarters).toHaveLength(3);
    expect(
      profile.prompting.conversationStarters.map((starter) => starter.intent),
    ).toEqual(['create', 'plan', 'analyze']);
  });

  it('drops ungrounded prompt seeds and replaces them from canonical topics', () => {
    const profile = parseGeneratedBrandProfile(
      JSON.stringify({
        ...response,
        promptSeeds: [
          { ...response.promptSeeds[0], topic: 'invented product' },
        ],
      }),
    );

    expect(profile.prompting.seeds.map((seed) => seed.topic)).not.toContain(
      'invented product',
    );
    expect(profile.prompting.seeds[0]?.topic).toBe('AI workflows');
  });

  it('rejects profiles without the fields needed for personalization', () => {
    let caught: unknown;
    try {
      parseGeneratedBrandProfile(JSON.stringify({ tone: 'confident' }));
    } catch (error: unknown) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BrandVoiceValidationError);
    const validationError = caught as BrandVoiceValidationError;
    expect(validationError.code).toBe(BrandVoiceFailureCode.INCOMPLETE_PROFILE);
    expect(validationError.missingFields).toEqual([
      'style',
      'audience',
      'topics',
    ]);
    expect(validationError.message).toBe(
      'Brand profile response is missing style, audience, topics.',
    );
  });

  it.each([
    ['', BrandVoiceFailureCode.EMPTY_OUTPUT],
    ['   ', BrandVoiceFailureCode.EMPTY_OUTPUT],
    ['not-json', BrandVoiceFailureCode.MALFORMED_OUTPUT],
    ['{"tone": ', BrandVoiceFailureCode.MALFORMED_OUTPUT],
    ['["tone"]', BrandVoiceFailureCode.UNEXPECTED_OUTPUT_SHAPE],
    ['"confident"', BrandVoiceFailureCode.UNEXPECTED_OUTPUT_SHAPE],
  ])('classifies unparseable output %j as %s', (content, reason) => {
    let caught: unknown;
    try {
      parseGeneratedBrandProfile(content);
    } catch (error: unknown) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BrandVoiceValidationError);
    expect((caught as BrandVoiceValidationError).code).toBe(reason);
    expect((caught as BrandVoiceValidationError).missingFields).toEqual([]);
  });

  it('recovers a profile object wrapped in fences or a single-element array', () => {
    const fenced = `\`\`\`json\n${JSON.stringify(response)}\n\`\`\``;
    const wrapped = JSON.stringify([response]);

    expect(parseGeneratedBrandProfile(fenced).tone).toBe(response.tone);
    expect(parseGeneratedBrandProfile(wrapped).tone).toBe(response.tone);
  });

  it('still rejects an incomplete profile recovered from an array wrapper', () => {
    let caught: unknown;
    try {
      parseGeneratedBrandProfile(JSON.stringify([{ tone: 'confident' }]));
    } catch (error: unknown) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BrandVoiceValidationError);
    expect((caught as BrandVoiceValidationError).code).toBe(
      BrandVoiceFailureCode.INCOMPLETE_PROFILE,
    );
  });

  it('never echoes the provider payload in the validation error', () => {
    const secret = 'provider-payload-marker';
    let caught: unknown;
    try {
      parseGeneratedBrandProfile(`{"tone": "${secret}", "leak": "${secret}"}`);
    } catch (error: unknown) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(BrandVoiceValidationError);
    expect((caught as BrandVoiceValidationError).message).not.toContain(secret);
    expect(
      (caught as BrandVoiceValidationError).missingFields.join(','),
    ).not.toContain(secret);
  });
});

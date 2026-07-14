import { parseGeneratedBrandProfile } from '@api/collections/brands/utils/brand-profile-generation.util';

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
    expect(() =>
      parseGeneratedBrandProfile(JSON.stringify({ tone: 'confident' })),
    ).toThrow('missing tone, style, audience, or topics');
  });
});

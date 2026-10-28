import {
  buildOnboardingImageBrief,
  readPostIdea,
} from '@api/endpoints/onboarding/utils/onboarding-image-brief.util';
import { renderStructuredPrompt } from '@genfeedai/harness';

const PET_POST =
  'Natural Pet Supply Knox stocks shelf-stable raw diets, grain-free kibble, and single-ingredient treats—all chosen by people who read labels. Stop guessing what’s in the bowl. Shop local, feed with confidence.';
const AGENT_POST =
  'I build AI agents that do the boring work for you—lead gen, follow-ups, data entry, even scheduling. No fluff, just automation that runs while you sleep. Follow along and I’ll show you how to reclaim your time. 🛠️🤖';

function render(brief: ReturnType<typeof buildOnboardingImageBrief>) {
  const { blacklist, ...slots } = brief.slots;
  return renderStructuredPrompt(
    { ...slots, avoid: blacklist },
    { lead: brief.prompt },
  );
}

describe('readPostIdea', () => {
  it('keeps the first sentence and drops links, mentions, hashtags and emoji', () => {
    expect(
      readPostIdea('Fresh drop 🎉 https://acme.co #launch. More soon.'),
    ).toBe('Fresh drop');
  });

  it('caps a long sentence at a word boundary', () => {
    const idea = readPostIdea(`${'word '.repeat(80)}end.`);
    expect(idea.length).toBeLessThanOrEqual(200);
    expect(idea.endsWith('word')).toBe(true);
  });

  it('is empty when the post has nothing visual to keep', () => {
    expect(readPostIdea('🔥🔥 #wow')).toBe('');
  });
});

describe('buildOnboardingImageBrief', () => {
  it('builds a product still life for a local shop, with no form echoes', () => {
    const brief = buildOnboardingImageBrief({
      audience: 'people who purchase',
      brandName: 'Ytgibson182',
      description: 'Content brand for Ytgibson182.',
      goals: ['Grow my audience', 'Sell my product'],
      offer: 'Natural Pet Supply Knox',
      post: PET_POST,
      tone: 'professional',
    });
    const { prompt, usedSlots } = render(brief);

    expect(brief.prompt).toContain('shelf-stable raw diets');
    expect(brief.slots.style).toContain('editorial product photography');
    expect(brief.slots.style).toContain('clean commercial finish');
    expect(brief.slots.style).toContain('precise composition');
    expect(brief.slots.style).toContain('scroll-stopping contrast');
    expect(usedSlots).toEqual(
      expect.arrayContaining([
        'subject',
        'action',
        'scene',
        'camera',
        'lens',
        'lighting',
        'style',
        'mood',
      ]),
    );
    for (const filler of [
      'Content brand for',
      'Brand context',
      'Write for this audience',
      'Ytgibson182',
      'Requested creative direction',
    ]) {
      expect(prompt).not.toContain(filler);
    }
  });

  it('builds a tech visual for an automation builder with the filler description', () => {
    const brief = buildOnboardingImageBrief({
      audience: 'Aryan',
      brandName: 'Aryansh Stark',
      description: 'Content brand for Aryansh Stark.',
      goals: ['Grow my audience'],
      offer: 'Ai automation',
      post: AGENT_POST,
    });

    expect(brief.slots.style).toContain('3D render');
    expect(brief.slots.subject).toContain('connected nodes');
    expect(brief.prompt).toBe(
      'I build AI agents that do the boring work for you—lead gen, follow-ups, data entry, even scheduling',
    );
    expect(render(brief).prompt).not.toMatch(/Aryan/);
  });

  it('falls back to a generic still life when nothing identifies the brand', () => {
    const brief = buildOnboardingImageBrief({
      brandName: 'jdoe92',
      description: 'Default description. Use it as a pre-prompt',
      post: 'Small wins add up.',
    });

    expect(brief.prompt).toBe('Small wins add up');
    expect(brief.slots.style).toBe('minimal editorial still life');
    expect(brief.slots.action).toBeUndefined();
  });

  it('falls back to the typed offer when the post has no usable sentence', () => {
    const brief = buildOnboardingImageBrief({
      brandName: 'jdoe92',
      offer: 'Hand-poured candles',
      post: '🔥🔥',
    });

    expect(brief.prompt).toBe('Hand-poured candles');
    expect(brief.slots.style).toContain('product photography');
  });

  it('uses a real scraped description to pick the kind of image', () => {
    const brief = buildOnboardingImageBrief({
      brandName: 'Northside',
      description:
        'Strength and conditioning gym for small groups. Open daily.',
      post: 'Come lift with us.',
    });

    expect(brief.slots.style).toBe('natural sports photography');
  });

  it('always avoids logos, text and watermarks through the negative prompt', () => {
    const brief = buildOnboardingImageBrief({
      brandName: 'Acme',
      post: 'Hello world.',
    });

    expect(brief.slots.blacklist).toEqual(
      expect.arrayContaining(['logos', 'text overlays', 'watermarks']),
    );
    expect(render(brief).negativePrompt).toContain('text overlays');
  });
});

import {
  ENHANCE_PROMPT_BASE,
  isCinematicPromptCategory,
  loadCinematicLexiconGuidance,
  resolveEnhancePromptSystemPrompt,
  translateNaiveCinematicLanguage,
} from '@api/endpoints/ai-actions/prompts/cinematic-enhancement';
import { CINEMATIC_LEXICON } from '@api/endpoints/ai-actions/prompts/cinematic-lexicon';
import { PromptCategory } from '@genfeedai/contracts';

const NAIVE_PROMPT_BENCHMARK: ReadonlyArray<{
  prompt: string;
  subject: string;
}> = [
  {
    prompt: 'shot from above looking down on a red jacket survivor, moody',
    subject: 'red jacket survivor',
  },
  {
    prompt: 'make it look dramatic from above, a desert tower',
    subject: 'desert tower',
  },
  {
    prompt: 'close on her face in the dark',
    subject: 'her face',
  },
  {
    prompt: 'camera moves toward him slowly',
    subject: 'him',
  },
  {
    prompt: 'two people talking, wide',
    subject: 'two people',
  },
  {
    prompt: 'sunset light on Anna',
    subject: 'Anna',
  },
  {
    prompt: 'spin around the car',
    subject: 'the car',
  },
  {
    prompt: 'make it feel like a dream, blurry background, a lighthouse',
    subject: 'lighthouse',
  },
  {
    prompt: 'cut quickly between shots of the city',
    subject: 'the city',
  },
  {
    prompt: 'hero walks toward camera in slow motion',
    subject: 'hero',
  },
];

describe('cinematic enhancement', () => {
  it('ships at least 100 named techniques across every lexicon category', () => {
    expect(CINEMATIC_LEXICON.length).toBeGreaterThanOrEqual(100);

    const categories = new Set(
      CINEMATIC_LEXICON.map((entry) => entry.category),
    );
    expect(categories).toEqual(
      new Set([
        'camera-movement',
        'editing-transitions',
        'framing-composition',
        'lighting',
        'stylistic-effects',
      ]),
    );

    for (const entry of CINEMATIC_LEXICON) {
      expect(entry.name.trim().length).toBeGreaterThan(0);
      expect(entry.definition.trim().length).toBeGreaterThan(0);
      expect(entry.whenToUse.trim().length).toBeGreaterThan(0);
    }
  });

  it('treats image and video prompt categories as cinematic', () => {
    expect(isCinematicPromptCategory(PromptCategory.MODELS_PROMPT_IMAGE)).toBe(
      true,
    );
    expect(isCinematicPromptCategory(PromptCategory.MODELS_PROMPT_VIDEO)).toBe(
      true,
    );
    expect(
      isCinematicPromptCategory(PromptCategory.PRESET_DESCRIPTION_IMAGE),
    ).toBe(true);
    expect(
      isCinematicPromptCategory(PromptCategory.PRESET_DESCRIPTION_VIDEO),
    ).toBe(true);
  });

  it('does not treat text-only categories as cinematic', () => {
    expect(
      isCinematicPromptCategory(PromptCategory.PRESET_DESCRIPTION_TEXT),
    ).toBe(false);
    expect(isCinematicPromptCategory(PromptCategory.ARTICLE)).toBe(false);
    expect(isCinematicPromptCategory(PromptCategory.POST_CONTENT_TWITTER)).toBe(
      false,
    );
    expect(isCinematicPromptCategory(PromptCategory.MODELS_PROMPT_MUSIC)).toBe(
      false,
    );
  });

  it('includes lexicon guidance for IMAGE and VIDEO enhancement system prompts', () => {
    const imagePrompt = resolveEnhancePromptSystemPrompt({
      category: PromptCategory.MODELS_PROMPT_IMAGE,
    });
    const videoPrompt = resolveEnhancePromptSystemPrompt({
      category: PromptCategory.MODELS_PROMPT_VIDEO,
    });

    expect(imagePrompt).toContain(ENHANCE_PROMPT_BASE);
    expect(imagePrompt).toContain('high-angle shot');
    expect(imagePrompt).toContain('golden hour');
    expect(imagePrompt).toContain('never invent camera jargon');
    expect(imagePrompt).toContain('Problem → Goal → Correction');
    expect(imagePrompt).toContain('full-quality model');
    expect(videoPrompt).toContain('whip pan');
    expect(videoPrompt).toContain('Preserve the user subject');
  });

  it('omits lexicon guidance for text-only enhancement system prompts', () => {
    const textPrompt = resolveEnhancePromptSystemPrompt({
      category: PromptCategory.PRESET_DESCRIPTION_TEXT,
    });
    const articlePrompt = resolveEnhancePromptSystemPrompt({
      category: PromptCategory.ARTICLE,
    });

    expect(textPrompt).toBe(ENHANCE_PROMPT_BASE);
    expect(textPrompt).not.toContain('Cinematography vocabulary');
    expect(articlePrompt).toBe(ENHANCE_PROMPT_BASE);
  });

  it('keeps subject pronouns out of lexicon aliases', () => {
    for (const technique of CINEMATIC_LEXICON) {
      for (const alias of technique.aliases) {
        expect(alias.toLowerCase()).not.toMatch(/\bhim\b/);
        expect(alias.toLowerCase()).not.toMatch(/\bher\b/);
      }
    }
  });

  it('rewrites 10 naive prompts with at least one lexicon term and preserved subject', () => {
    const names = new Set(CINEMATIC_LEXICON.map((entry) => entry.name));

    for (const { prompt, subject } of NAIVE_PROMPT_BENCHMARK) {
      const enhanced = translateNaiveCinematicLanguage(prompt);
      const usedTerms = [...names].filter((name) =>
        enhanced.toLowerCase().includes(name.toLowerCase()),
      );

      expect(enhanced.toLowerCase()).toContain(subject.toLowerCase());
      expect(usedTerms.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('falls back to the baseline enhance prompt when the lexicon loader fails', () => {
    const prompt = resolveEnhancePromptSystemPrompt({
      category: PromptCategory.MODELS_PROMPT_IMAGE,
      loadGuidance: () => {
        throw new Error('lexicon unavailable');
      },
    });

    expect(prompt).toBe(ENHANCE_PROMPT_BASE);
    expect(prompt).not.toContain('Cinematography vocabulary');
  });

  it('falls back when the lexicon loader returns empty guidance', () => {
    const prompt = resolveEnhancePromptSystemPrompt({
      category: PromptCategory.MODELS_PROMPT_VIDEO,
      loadGuidance: () => '',
    });

    expect(prompt).toBe(ENHANCE_PROMPT_BASE);
  });

  it('returns empty guidance when the module loader throws', () => {
    expect(
      loadCinematicLexiconGuidance(() => {
        throw new Error('cannot load');
      }),
    ).toBe('');
  });
});

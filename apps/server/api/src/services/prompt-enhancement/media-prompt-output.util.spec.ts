import {
  MEDIA_PROMPT_OUTPUT_CONTRACT,
  parseMediaPromptOutput,
} from '@api/services/prompt-enhancement/media-prompt-output.util';
import { describe, expect, it } from 'vitest';

const COACHING_REPORT = `## Image Prompt

**Recommended model:** Flux 2 Dev (best for emotional depth) with DALL-E 3 as alternative
**Aspect ratio:** 16:9 (1280x720)
**Style preset:** Cinematic editorial

### Prompt
A close-up of a woman in her early 30s at a clean desk.
Golden hour light from the left, 85mm f/1.4.

### Negative prompt
Not needed for this model (Flux 2 Dev). For Stable Diffusion: lowres, bad anatomy

### Generation settings
- Steps: 30
- CFG/Guidance: 1.0

### Notes
This prompt emphasizes the emotional outcome.`;

describe('parseMediaPromptOutput', () => {
  it('keeps only the prompt from a coaching report', () => {
    expect(parseMediaPromptOutput(COACHING_REPORT)).toEqual({
      prompt:
        'A close-up of a woman in her early 30s at a clean desk. Golden hour light from the left, 85mm f/1.4.',
    });
  });

  it('returns the negative prompt of a report when one applies', () => {
    const parsed = parseMediaPromptOutput(
      '### Prompt\nA loft at dawn.\n\n### Negative prompt\nblurry, watermark',
    );
    expect(parsed).toEqual({
      prompt: 'A loft at dawn.',
      negativePrompt: 'blurry, watermark',
    });
  });

  it('splits a trailing negative prompt line from plain text', () => {
    expect(
      parseMediaPromptOutput(
        'A **thoughtful** architect in a sunlit loft, 85mm lens.\nNegative prompt: blurry, extra fingers',
      ),
    ).toEqual({
      prompt: 'A thoughtful architect in a sunlit loft, 85mm lens.',
      negativePrompt: 'blurry, extra fingers',
    });
  });

  it('drops scaffolding lines that are not headed sections', () => {
    expect(
      parseMediaPromptOutput(
        'Recommended model: Flux 2 Dev\nAspect ratio: 16:9\nA red bicycle at dawn.\nSteps: 30',
      ),
    ).toEqual({ prompt: 'A red bicycle at dawn.' });
  });

  it('returns a plain prompt unchanged', () => {
    expect(parseMediaPromptOutput('A red bicycle at dawn.')).toEqual({
      prompt: 'A red bicycle at dawn.',
    });
  });

  it('returns an empty prompt when nothing usable remains', () => {
    expect(parseMediaPromptOutput('Recommended model: Flux 2 Dev').prompt).toBe(
      '',
    );
  });
});

describe('MEDIA_PROMPT_OUTPUT_CONTRACT', () => {
  it('forbids model names and settings in the prompt', () => {
    expect(MEDIA_PROMPT_OUTPUT_CONTRACT).toContain('Never mention model names');
    expect(MEDIA_PROMPT_OUTPUT_CONTRACT).toContain('Negative prompt:');
  });
});

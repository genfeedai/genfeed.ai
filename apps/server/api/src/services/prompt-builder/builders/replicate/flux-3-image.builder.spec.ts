import { buildFlux3ImageInput } from '@api/services/prompt-builder/builders/replicate/flux-3-image.builder';
import { ReplicateImageBuilder } from '@api/services/prompt-builder/builders/replicate/replicate-image.builder';
import { ModelCategory } from '@genfeedai/contracts';
import { FLUX_3_RESOLUTIONS, MODEL_KEYS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

describe('FLUX.3 exact provider input', () => {
  it.each(FLUX_3_RESOLUTIONS)(
    'preserves native %s resolution and literal editing instruction',
    (resolution) => {
      expect(
        buildFlux3ImageInput(
          'Change only the sign',
          ['https://cdn.example/a.png'],
          resolution,
          'auto',
        ),
      ).toEqual({
        prompt: 'Change only the sign',
        images: ['https://cdn.example/a.png'],
        resolution,
        aspect_ratio: 'auto',
        grounding: false,
        output_format: 'jpg',
        output_quality: 80,
      });
    },
  );
  it('routes text generation through the dedicated builder', () => {
    const builder = new ReplicateImageBuilder({
      get: () => undefined,
    } as never);
    expect(
      builder.buildPrompt(
        MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_3_IMAGE,
        {
          modelCategory: ModelCategory.IMAGE,
          prompt: 'A city',
          resolution: '4k',
          aspectRatio: '21:9',
        },
        'A city',
      ),
    ).toEqual(buildFlux3ImageInput('A city', [], '4k', '21:9'));
  });
  it('fails invalid resolution and excess references rather than dropping them', () => {
    expect(() => buildFlux3ImageInput('Edit', [], '2K')).toThrow();
    expect(() =>
      buildFlux3ImageInput('Edit', Array(11).fill('https://cdn.example/a.png')),
    ).toThrow();
  });
});

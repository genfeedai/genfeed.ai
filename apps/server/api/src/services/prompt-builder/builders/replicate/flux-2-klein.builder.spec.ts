import { buildFlux2KleinInput } from '@api/services/prompt-builder/builders/replicate/flux-2-klein.builder';
import { ReplicateImageBuilder } from '@api/services/prompt-builder/builders/replicate/replicate-image.builder';
import { ModelCategory } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

describe('FLUX.2 klein 4B provider input', () => {
  it('sends the Replicate schema fields with references as images', () => {
    expect(
      buildFlux2KleinInput(
        'A storyboard sketch',
        ['https://cdn.example/a.png', 'https://cdn.example/b.png'],
        '9:16',
        '0.5',
        7,
      ),
    ).toEqual({
      prompt: 'A storyboard sketch',
      images: ['https://cdn.example/a.png', 'https://cdn.example/b.png'],
      aspect_ratio: '9:16',
      output_megapixels: '0.5',
      output_format: 'jpg',
      output_quality: 90,
      seed: 7,
    });
  });

  it('defaults to one megapixel and matches the first reference when no ratio is given', () => {
    expect(
      buildFlux2KleinInput('Edit', ['https://cdn.example/a.png'], undefined),
    ).toMatchObject({
      aspect_ratio: 'match_input_image',
      output_megapixels: '1',
    });
    expect(buildFlux2KleinInput('Text only', [], undefined, '1K')).toEqual(
      expect.objectContaining({ aspect_ratio: '1:1', output_megapixels: '1' }),
    );
  });

  it('refuses more than five references and unsupported ratios', () => {
    expect(() =>
      buildFlux2KleinInput('Edit', Array(6).fill('https://cdn.example/a.png')),
    ).toThrow();
    expect(() => buildFlux2KleinInput('Edit', [], '2:1')).toThrow();
  });

  it('routes the catalog key through the dedicated builder', () => {
    const builder = new ReplicateImageBuilder({
      get: () => undefined,
    } as never);
    expect(
      builder.buildPrompt(
        MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_KLEIN_4B,
        {
          modelCategory: ModelCategory.IMAGE,
          prompt: 'A city',
          references: ['https://cdn.example/a.png'],
          width: 1080,
          height: 1920,
        },
        'A city',
      ),
    ).toEqual(
      buildFlux2KleinInput('A city', ['https://cdn.example/a.png'], '9:16'),
    );
  });
});

import { JsonPromptBuilder } from '@api/services/prompt-builder/utils/json-prompt.util';
import { ModelCategory } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('JsonPromptBuilder', () => {
  it('copies the prompt and omits empty creative fields', () => {
    expect(
      JsonPromptBuilder.build({
        modelCategory: ModelCategory.IMAGE,
        prompt: 'a red bicycle',
      }),
    ).toEqual({
      elements: {},
      text: 'a red bicycle',
    });
  });

  it('includes creative elements, speech, and sounds when present', () => {
    const prompt = JsonPromptBuilder.build({
      camera: '35mm',
      cameraMovement: 'dolly-in',
      lens: 'prime',
      lighting: 'soft',
      modelCategory: ModelCategory.VIDEO,
      mood: 'tense',
      prompt: 'night street',
      scene: 'alley',
      sounds: ['rain', 'traffic'],
      speech: '  keep moving  ',
      style: 'noir',
    });

    expect(prompt.elements).toEqual({
      camera: '35mm',
      cameraMovement: 'dolly-in',
      lens: 'prime',
      lighting: 'soft',
      mood: 'tense',
      scene: 'alley',
      sounds: 'rain, traffic',
      speech: 'keep moving',
      style: 'noir',
    });
  });

  it('resolves branding from brandingMode or isBrandingEnabled', () => {
    const branded = JsonPromptBuilder.build({
      brand: {
        description: 'Bikes',
        label: 'Acme',
        primaryColor: '#111',
        secondaryColor: '#eee',
        text: 'Ride',
      },
      branding: {
        audience: 'commuters',
        hashtags: ['#ride'],
        taglines: ['Go farther'],
        tone: 'direct',
        values: ['craft'],
        voice: 'first-person',
      },
      brandingMode: 'brand',
      modelCategory: ModelCategory.IMAGE,
      prompt: 'hero',
    });

    expect(branded.elements.brand).toEqual({
      description: 'Bikes',
      label: 'Acme',
      primaryColor: '#111',
      secondaryColor: '#eee',
      text: 'Ride',
    });
    expect(branded.elements.branding).toEqual({
      audience: 'commuters',
      hashtags: ['#ride'],
      taglines: ['Go farther'],
      tone: 'direct',
      values: ['craft'],
      voice: 'first-person',
    });

    expect(
      JsonPromptBuilder.build({
        brand: { label: 'Acme' },
        isBrandingEnabled: false,
        modelCategory: ModelCategory.IMAGE,
        prompt: 'hero',
      }).elements.brand,
    ).toBeUndefined();
  });

  it('stringifies the built prompt', () => {
    const params = {
      modelCategory: ModelCategory.IMAGE,
      prompt: 'a red bicycle',
    };
    const built = JsonPromptBuilder.build(params);

    expect(JsonPromptBuilder.stringify(built)).toBe(JSON.stringify(built));
    expect(JsonPromptBuilder.buildAndStringify(params)).toBe(
      JSON.stringify(built),
    );
  });
});

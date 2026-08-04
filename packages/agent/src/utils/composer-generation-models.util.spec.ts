import { COMPOSER_GENERATION_AUTO_MODEL_KEY } from '@genfeedai/agent/constants/composer-mode.constant';
import type { GenerationModel } from '@genfeedai/agent/services/agent-api.service';
import { describe, expect, it } from 'vitest';
import {
  mapGenerationModelsToSelectorOptions,
  resolveGenerationModelSelection,
  toGenerationSelectorSelectedKey,
} from './composer-generation-models.util';

describe('composer-generation-models.util', () => {
  it('prepends Auto and maps generation models into selector options', () => {
    const options = mapGenerationModelsToSelectorOptions([
      {
        description: 'Fast image model',
        key: 'provider/image-a',
        label: 'Image A',
        provider: 'replicate',
      } as GenerationModel,
    ]);

    expect(options[0]?.key).toBe(COMPOSER_GENERATION_AUTO_MODEL_KEY);
    expect(options[0]?.label).toBe('Auto');
    expect(options[1]?.key).toBe('provider/image-a');
    expect(options[1]?.label).toBe('Image A');
    expect(options[1]?.description).toBe('Fast image model');
  });

  it('resolves Auto keys to null for the send payload', () => {
    expect(
      resolveGenerationModelSelection(COMPOSER_GENERATION_AUTO_MODEL_KEY),
    ).toBeNull();
    expect(resolveGenerationModelSelection('')).toBeNull();
    expect(resolveGenerationModelSelection('provider/image-a')).toBe(
      'provider/image-a',
    );
  });

  it('maps null generation keys to the Auto selector key', () => {
    expect(toGenerationSelectorSelectedKey(null)).toBe(
      COMPOSER_GENERATION_AUTO_MODEL_KEY,
    );
    expect(toGenerationSelectorSelectedKey('provider/image-a')).toBe(
      'provider/image-a',
    );
  });
});

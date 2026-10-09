import { CreatePresetDto } from '@api/collections/presets/dto/create-preset.dto';
import { ModelCategory } from '@genfeedai/contracts';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

describe('CreatePresetDto generation controls', () => {
  it('validates a complete persisted template', async () => {
    const dto = Object.assign(new CreatePresetDto(), {
      key: 'studio-dance',
      label: 'Dance',
      category: ModelCategory.VIDEO,
      prompt: 'Dance',
      aspectRatio: '9:16',
      duration: 8,
      lighting: 'soft',
      lens: '35mm',
      cameraMovement: 'static',
      promptTemplate: 'video-default',
    });
    expect(await validate(dto)).toEqual([]);
  });
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 3601])(
    'rejects an invalid duration %s',
    async (duration) => {
      const errors = await validate(
        Object.assign(new CreatePresetDto(), {
          key: 'preset',
          label: 'Preset',
          category: ModelCategory.VIDEO,
          duration,
        }),
      );
      expect(errors.some((error) => error.property === 'duration')).toBe(true);
    },
  );
  it('rejects a malformed aspect ratio', async () => {
    const errors = await validate(
      Object.assign(new CreatePresetDto(), {
        key: 'preset',
        label: 'Preset',
        category: ModelCategory.IMAGE,
        aspectRatio: '0:16',
      }),
    );
    expect(errors.some((error) => error.property === 'aspectRatio')).toBe(true);
  });
});

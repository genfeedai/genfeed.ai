import type { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { compileSubmittedAdPreset } from '@api/collections/videos/services/ad-preset-submit.util';
import { MINIMAX_H3_MODEL_KEY } from '@genfeedai/contracts/api-types/contracts/video-generation-capability-profile.contract';
import {
  AD_PRESETS,
  adPresetId,
} from '@genfeedai/contracts/constants/ad-presets.constant';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const preset = {
    ...AD_PRESETS[0],
    sections: AD_PRESETS[0].sections.map((section) =>
      section.key === 'lighting'
        ? { ...section, template: 'Operator-edited lighting.' }
        : section,
    ),
  };
  const ingredients = {
    findOne: vi.fn().mockResolvedValue({ metadata: { duration: 6.2 } }),
    prisma: {
      preset: {
        findFirst: vi.fn().mockResolvedValue({ config: { adPreset: preset } }),
      },
    },
  };
  const dto: CreateVideoDto = {
    references: ['person'],
    audioReferences: ['voice'],
    adPreset: {
      presetId: adPresetId(preset.key),
      params: {
        aspectRatio: '9:16',
        lensMm: 24,
        qualityLook: 'Phone selfie',
        dialogue: 'SYNTHETIC dialogue.\nKeep this exactly!',
        referenceRoles: [
          { token: '@Image1', role: 'person' },
          { token: '@Audio1', role: 'voiceover' },
        ],
      },
    },
  };
  const input = {
    dto,
    ingredients: ingredients as unknown as Parameters<
      typeof compileSubmittedAdPreset
    >[0]['ingredients'],
    organizationId: 'organization',
    brandId: 'brand',
    model: MINIMAX_H3_MODEL_KEY,
  };
  return { ingredients, input };
}

describe('ad preset submit', () => {
  it('loads persisted edits and trusted audio metadata; scopes catalog and audio access', async () => {
    const { ingredients, input } = fixture();
    const result = await compileSubmittedAdPreset(input);
    expect(result.text).toContain('Operator-edited lighting.');
    expect(result.text).toContain(input.dto.adPreset?.params.dialogue);
    expect(result).toMatchObject({
      duration: 7,
      width: 1080,
      height: 1920,
      harness: false,
      brandMode: 'raw',
      useTemplate: false,
    });
    expect(ingredients.prisma.preset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          isActive: true,
          OR: [
            {
              organizationId: 'organization',
              OR: [{ brandId: null }, { brandId: 'brand' }],
            },
            { organizationId: null, brandId: null },
          ],
        }),
      }),
    );
    expect(ingredients.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'organization',
        isDeleted: false,
        id: 'voice',
      }),
      expect.any(Array),
    );
  });
  it('rejects absent/inaccessible/inactive presets instead of falling back to seed data', async () => {
    const { ingredients, input } = fixture();
    ingredients.prisma.preset.findFirst.mockResolvedValue(null);
    await expect(compileSubmittedAdPreset(input)).rejects.toMatchObject({
      response: { code: 'INVALID_PRESET' },
    });
  });
  it('rejects unknown duration and shorter outer duration before dispatch preparation', async () => {
    const { ingredients, input } = fixture();
    input.dto = { ...input.dto, duration: 6 };
    await expect(compileSubmittedAdPreset(input)).rejects.toMatchObject({
      response: { code: 'DURATION_SHORTER_THAN_AUDIO' },
    });
    ingredients.findOne.mockResolvedValue(null);
    await expect(compileSubmittedAdPreset(input)).rejects.toMatchObject({
      response: { code: 'UNKNOWN_AUDIO_DURATION' },
    });
  });
  it('leaves ordinary video requests alone', async () => {
    const { input, ingredients } = fixture();
    const dto = { text: 'An ordinary video' };
    expect(await compileSubmittedAdPreset({ ...input, dto })).toBe(dto);
    expect(ingredients.prisma.preset.findFirst).not.toHaveBeenCalled();
  });
});

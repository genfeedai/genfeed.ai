import type { IModel } from '@genfeedai/interfaces';
import { ModelCategory, ModelKey, ModelProvider } from '@genfeedai/enums';

import {
  DEFAULT_VIDEO_DURATION_OPTIONS,
  filterModelsByAspectRatio,
  getAspectRatioForFormat,
  getFormatForAspectRatio,
  resolveGenerationModelControls,
} from '@helpers/generation-controls.helper';

function createMockModel(overrides: Partial<IModel> = {}): IModel {
  return {
    category: ModelCategory.IMAGE,
    cost: 10,
    createdAt: '2025-01-01T00:00:00.000Z',
    id: 'test-model-id',
    isActive: true,
    isDefault: false,
    isDeleted: false,
    key: ModelKey.REPLICATE_GOOGLE_IMAGEN_4,
    label: 'Test Model',
    maxOutputs: 4,
    provider: ModelProvider.REPLICATE,
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('generation-controls.helper', () => {
  describe('format and ratio mapping', () => {
    it('maps supported formats to aspect ratios', () => {
      expect(getAspectRatioForFormat('portrait')).toBe('9:16');
      expect(getAspectRatioForFormat('landscape')).toBe('16:9');
      expect(getAspectRatioForFormat('square')).toBe('1:1');
    });

    it('maps supported aspect ratios back to ingredient formats', () => {
      expect(getFormatForAspectRatio('9:16')).toBe('portrait');
      expect(getFormatForAspectRatio('16:9')).toBe('landscape');
      expect(getFormatForAspectRatio('1:1')).toBe('square');
      expect(getFormatForAspectRatio('4:3')).toBeNull();
    });
  });

  describe('filterModelsByAspectRatio', () => {
    it('filters by both category and aspect ratio support', () => {
      const portraitImageModel = createMockModel({
        aspectRatios: ['1:1', '9:16'],
        category: ModelCategory.IMAGE,
        id: 'image-portrait',
        key: ModelKey.REPLICATE_GOOGLE_IMAGEN_4,
      });
      const landscapeVideoModel = createMockModel({
        aspectRatios: ['16:9'],
        category: ModelCategory.VIDEO,
        id: 'video-landscape',
        key: ModelKey.REPLICATE_GOOGLE_VEO_3,
      });

      expect(
        filterModelsByAspectRatio(
          [portraitImageModel, landscapeVideoModel],
          '9:16',
          ModelCategory.IMAGE,
        ),
      ).toEqual([portraitImageModel]);
    });
  });

  describe('resolveGenerationModelControls', () => {
    it('uses model metadata for image controls', () => {
      const imageModel = createMockModel({
        aspectRatios: ['1:1', '3:4'],
        defaultAspectRatio: '3:4',
      });

      expect(resolveGenerationModelControls(imageModel, 'image')).toEqual({
        availableAspectRatios: ['1:1', '3:4'],
        defaultAspectRatio: '3:4',
        durationOptions: [],
        showDuration: false,
      });
    });

    it('uses model metadata for video controls', () => {
      const videoModel = createMockModel({
        aspectRatios: ['16:9', '9:16'],
        category: ModelCategory.VIDEO,
        defaultAspectRatio: '9:16',
        defaultDuration: 8,
        durations: [5, 8, 10],
        hasDurationEditing: false,
        id: 'video-model',
        key: ModelKey.REPLICATE_GOOGLE_VEO_3,
      });

      expect(resolveGenerationModelControls(videoModel, 'video')).toEqual({
        availableAspectRatios: ['16:9', '9:16'],
        defaultAspectRatio: '9:16',
        defaultDuration: 8,
        durationOptions: [5, 8, 10],
        showDuration: false,
      });
    });

    it('falls back cleanly when no model is selected', () => {
      expect(resolveGenerationModelControls(null, 'video')).toEqual({
        availableAspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4'],
        defaultAspectRatio: '1:1',
        defaultDuration: DEFAULT_VIDEO_DURATION_OPTIONS[0],
        durationOptions: [...DEFAULT_VIDEO_DURATION_OPTIONS],
        showDuration: true,
      });
    });
  });
});

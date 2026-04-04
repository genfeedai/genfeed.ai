import {
  CINEMATIC_PRESETS,
  type CinematicPreset,
  getAllPresets,
  getPresetById,
  getPresetsByCategory,
} from '@workflow-engine/presets/cinematic-presets';
import { beforeEach, describe, expect, it } from 'vitest';

describe('CinematicPresets', () => {
  describe('Preset Structure', () => {
    it('should have exactly 6 presets defined', () => {
      const presets = getAllPresets();
      expect(presets).toHaveLength(6);
    });

    it('should have all required preset IDs', () => {
      const expectedIds = [
        'hollywood_blockbuster',
        'documentary_raw',
        'social_media_cinematic',
        'indie_film',
        'vintage_35mm',
        'commercial_clean',
      ];

      expectedIds.forEach((id) => {
        expect(CINEMATIC_PRESETS[id]).toBeDefined();
      });
    });

    it('should have valid structure for each preset', () => {
      const presets = getAllPresets();

      presets.forEach((preset) => {
        // Check top-level properties
        expect(preset.id).toBeTruthy();
        expect(preset.name).toBeTruthy();
        expect(preset.description).toBeTruthy();
        expect(preset.cameraPrompt).toBeTruthy();

        // Check colorGrade
        expect(preset.colorGrade).toBeDefined();
        expect(preset.colorGrade.cameraProfile).toBeTruthy();
        expect(typeof preset.colorGrade.contrast).toBe('number');
        expect(typeof preset.colorGrade.saturation).toBe('number');
        expect(typeof preset.colorGrade.temperature).toBe('number');
        expect(typeof preset.colorGrade.shadows).toBe('number');
        expect(typeof preset.colorGrade.midtones).toBe('number');
        expect(typeof preset.colorGrade.highlights).toBe('number');

        // Check filmGrain
        expect(preset.filmGrain).toBeDefined();
        expect(preset.filmGrain.stock).toBeTruthy();
        expect(typeof preset.filmGrain.intensity).toBe('number');
        expect(preset.filmGrain.size).toBeTruthy();
        expect(typeof preset.filmGrain.colorGrain).toBe('boolean');

        // Check lensEffects
        expect(preset.lensEffects).toBeDefined();
        expect(preset.lensEffects.vignette).toBeDefined();
        expect(preset.lensEffects.chromaticAberration).toBeDefined();
        expect(preset.lensEffects.barrelDistortion).toBeDefined();
        expect(preset.lensEffects.bloom).toBeDefined();
      });
    });
  });

  describe('Hollywood Blockbuster Preset', () => {
    let preset: CinematicPreset;

    beforeEach(() => {
      preset = CINEMATIC_PRESETS.hollywood_blockbuster;
    });

    it('should have correct camera prompt', () => {
      expect(preset.cameraPrompt).toContain('ARRI Alexa Mini LF');
      expect(preset.cameraPrompt).toContain('Cooke S7/i 50mm T2.0');
    });

    it('should have ARRI LogC3 color profile', () => {
      expect(preset.colorGrade.cameraProfile).toBe('ARRI LogC3');
    });

    it('should have subtle film grain', () => {
      expect(preset.filmGrain.intensity).toBeLessThan(0.3);
      expect(preset.filmGrain.colorGrain).toBe(false);
    });

    it('should have vignette enabled but minimal chromatic aberration', () => {
      expect(preset.lensEffects.vignette.enabled).toBe(true);
      expect(preset.lensEffects.chromaticAberration.enabled).toBe(false);
    });
  });

  describe('Documentary Raw Preset', () => {
    let preset: CinematicPreset;

    beforeEach(() => {
      preset = CINEMATIC_PRESETS.documentary_raw;
    });

    it('should have RED camera specs', () => {
      expect(preset.cameraPrompt).toContain('RED V-Raptor XL');
    });

    it('should have low saturation for natural look', () => {
      expect(preset.colorGrade.saturation).toBeLessThan(1.0);
    });

    it('should have minimal film grain', () => {
      expect(preset.filmGrain.intensity).toBeLessThan(0.1);
    });

    it('should have some lens imperfections for realism', () => {
      expect(preset.lensEffects.chromaticAberration.enabled).toBe(true);
      expect(preset.lensEffects.barrelDistortion.enabled).toBe(true);
    });
  });

  describe('Social Media Cinematic Preset', () => {
    let preset: CinematicPreset;

    beforeEach(() => {
      preset = CINEMATIC_PRESETS.social_media_cinematic;
    });

    it('should have vibrant, punchy settings', () => {
      expect(preset.colorGrade.contrast).toBeGreaterThan(1.2);
      expect(preset.colorGrade.saturation).toBeGreaterThan(1.1);
    });

    it('should have strong vignette for focus', () => {
      expect(preset.lensEffects.vignette.enabled).toBe(true);
      expect(preset.lensEffects.vignette.intensity).toBeGreaterThan(0.3);
    });

    it('should have color grain for digital warmth', () => {
      expect(preset.filmGrain.colorGrain).toBe(true);
    });
  });

  describe('Indie Film Preset', () => {
    let preset: CinematicPreset;

    beforeEach(() => {
      preset = CINEMATIC_PRESETS.indie_film;
    });

    it('should have desaturated look', () => {
      expect(preset.colorGrade.saturation).toBeLessThan(0.8);
    });

    it('should have visible film grain', () => {
      expect(preset.filmGrain.intensity).toBeGreaterThan(0.3);
    });

    it('should have anamorphic characteristics', () => {
      expect(preset.cameraPrompt).toContain('anamorphic');
      expect(preset.lensEffects.chromaticAberration.enabled).toBe(true);
    });
  });

  describe('Vintage 35mm Preset', () => {
    let preset: CinematicPreset;

    beforeEach(() => {
      preset = CINEMATIC_PRESETS.vintage_35mm;
    });

    it('should have heavy grain', () => {
      expect(preset.filmGrain.intensity).toBeGreaterThan(0.5);
      expect(preset.filmGrain.size).toBe('large');
    });

    it('should have warm color shift', () => {
      expect(preset.colorGrade.temperature).toBeLessThan(5000);
    });

    it('should have lifted blacks', () => {
      expect(preset.colorGrade.shadows).toBeGreaterThan(20);
    });

    it('should have halation characteristics', () => {
      expect(preset.cameraPrompt).toContain('halation');
      expect(preset.lensEffects.bloom.enabled).toBe(true);
    });
  });

  describe('Commercial Clean Preset', () => {
    let preset: CinematicPreset;

    beforeEach(() => {
      preset = CINEMATIC_PRESETS.commercial_clean;
    });

    it('should have no film grain', () => {
      expect(preset.filmGrain.intensity).toBe(0);
    });

    it('should have balanced color grading', () => {
      expect(preset.colorGrade.saturation).toBe(1.0);
      expect(preset.colorGrade.shadows).toBe(0);
      expect(preset.colorGrade.midtones).toBe(0);
      expect(preset.colorGrade.highlights).toBe(0);
    });

    it('should have minimal lens effects', () => {
      expect(preset.lensEffects.chromaticAberration.enabled).toBe(false);
      expect(preset.lensEffects.barrelDistortion.enabled).toBe(false);
    });
  });

  describe('getPresetById', () => {
    it('should return preset when valid ID is provided', () => {
      const preset = getPresetById('hollywood_blockbuster');
      expect(preset).toBeDefined();
      expect(preset?.id).toBe('hollywood_blockbuster');
    });

    it('should return null when invalid ID is provided', () => {
      const preset = getPresetById('nonexistent_preset');
      expect(preset).toBeNull();
    });
  });

  describe('getAllPresets', () => {
    it('should return array of all presets', () => {
      const presets = getAllPresets();
      expect(Array.isArray(presets)).toBe(true);
      expect(presets.length).toBe(6);
    });

    it('should return presets with unique IDs', () => {
      const presets = getAllPresets();
      const ids = presets.map((p) => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('getPresetsByCategory', () => {
    it('should return professional presets', () => {
      const presets = getPresetsByCategory('professional');
      expect(presets.length).toBe(3);
      expect(presets.map((p) => p.id)).toEqual(
        expect.arrayContaining([
          'hollywood_blockbuster',
          'documentary_raw',
          'commercial_clean',
        ]),
      );
    });

    it('should return social presets', () => {
      const presets = getPresetsByCategory('social');
      expect(presets.length).toBe(1);
      expect(presets[0].id).toBe('social_media_cinematic');
    });

    it('should return artistic presets', () => {
      const presets = getPresetsByCategory('artistic');
      expect(presets.length).toBe(2);
      expect(presets.map((p) => p.id)).toEqual(
        expect.arrayContaining(['indie_film', 'vintage_35mm']),
      );
    });

    it('should return empty array for invalid category', () => {
      const presets = getPresetsByCategory('invalid' as any);
      expect(presets).toEqual([]);
    });
  });
});

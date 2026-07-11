import {
  CINEMATIC_CAMERA_PRESETS,
  getCinematicCameraPreset,
  listCinematicCameraPresetIds,
} from '@workflow-engine/executors/saas/cinematic-camera-presets';
import { describe, expect, it } from 'vitest';

describe('cinematic-camera-presets', () => {
  it('has 6 presets', () => {
    expect(listCinematicCameraPresetIds().length).toBe(6);
  });

  it('gets preset by id', () => {
    const preset = getCinematicCameraPreset('hollywood_blockbuster');
    expect(preset).toBeDefined();
    expect(preset?.camera).toBe('ARRI Alexa Mini LF');
  });

  it('returns undefined for unknown id', () => {
    expect(getCinematicCameraPreset('nonexistent')).toBeUndefined();
  });

  it('each preset has required fields', () => {
    for (const [id, preset] of Object.entries(CINEMATIC_CAMERA_PRESETS)) {
      expect(preset.id).toBe(id);
      expect(preset.name).toBeTruthy();
      expect(preset.camera).toBeTruthy();
      expect(preset.promptFragment).toBeTruthy();
      expect(preset.colorGrade).toBeDefined();
      expect(preset.filmGrain).toBeDefined();
      expect(preset.lensEffects).toBeDefined();
    }
  });
});

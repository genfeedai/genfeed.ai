import { describe, expect, it } from 'vitest';
import { getAllPresets } from './cinematic-presets';
import {
  compileUgcPrompt,
  composeUgcPromptBlocks,
  getAllUgcPresets,
  getAllVideoPresets,
  getUgcPresetById,
  isUgcPresetId,
  UGC_CAMERA_MODES,
  UGC_PRESETS,
  type UgcCameraMode,
  type UgcPreset,
} from './ugc-presets';

const CINEMATIC_GLOSS_PATTERNS: RegExp[] = [
  /\banamorphic\b/i,
  /red v-?raptor/i,
  /sony venice/i,
  /\barri\b/i,
  /panavision/i,
  /cinealta/i,
  /lens flare/i,
  /cinema[- ]camera/i,
  /cooke s7/i,
  /blackmagic/i,
];

const UGC_PRESET_IDS = [
  'ugc_selfie_handheld',
  'ugc_tripod_vlog',
  'ugc_filmed_by_another',
] as const;

function expectNoCinematicGloss(text: string): void {
  for (const pattern of CINEMATIC_GLOSS_PATTERNS) {
    expect(text, `unexpected cinematic gloss matching ${pattern}`).not.toMatch(
      pattern,
    );
  }
}

describe('UgcPresets', () => {
  describe('three camera modes', () => {
    it('exposes selfie-handheld, tripod-vlog, and filmed-by-another-person', () => {
      expect(UGC_CAMERA_MODES).toEqual([
        'selfie-handheld',
        'tripod-vlog',
        'filmed-by-another-person',
      ]);
    });

    it('has exactly one preset per camera mode', () => {
      const presets = getAllUgcPresets();
      expect(presets).toHaveLength(3);

      const modes = presets.map((preset) => preset.cameraMode);
      expect(new Set(modes)).toEqual(
        new Set<UgcCameraMode>([
          'selfie-handheld',
          'tripod-vlog',
          'filmed-by-another-person',
        ]),
      );
    });

    it('uses stable ids for the three camera-mode presets', () => {
      for (const id of UGC_PRESET_IDS) {
        expect(UGC_PRESETS[id]).toBeDefined();
        expect(getUgcPresetById(id)?.id).toBe(id);
        expect(isUgcPresetId(id)).toBe(true);
      }
    });
  });

  describe('four-block composition', () => {
    it('composes micro-expression, camera-imperfection, identity-lock, and framing-anchor blocks', () => {
      const presets = getAllUgcPresets();

      presets.forEach((preset) => {
        const blocks = composeUgcPromptBlocks({
          hasStartFrameReference: false,
          preset,
        });

        expect(blocks.microExpression).toMatch(/eyebrow raise/i);
        expect(blocks.microExpression).toMatch(/controlled pauses/i);
        expect(blocks.microExpression).toMatch(/facial stillness/i);

        expect(blocks.cameraImperfection.length).toBeGreaterThan(0);
        expect(blocks.identityLock).toMatch(/facial proportions/i);
        expect(blocks.identityLock).toMatch(/eye shape/i);
        expect(blocks.identityLock).toMatch(/hairstyle/i);
        expect(blocks.identityLock).toMatch(/natural skin texture/i);
        expect(blocks.framingAnchor).toMatch(/framing/i);
      });
    });

    it('varies camera-imperfection copy by camera mode', () => {
      const selfie = composeUgcPromptBlocks({
        hasStartFrameReference: false,
        preset: UGC_PRESETS.ugc_selfie_handheld,
      });
      const tripod = composeUgcPromptBlocks({
        hasStartFrameReference: false,
        preset: UGC_PRESETS.ugc_tripod_vlog,
      });
      const filmedByAnother = composeUgcPromptBlocks({
        hasStartFrameReference: false,
        preset: UGC_PRESETS.ugc_filmed_by_another,
      });

      expect(selfie.cameraImperfection).toMatch(/handheld selfie sway/i);
      expect(selfie.cameraImperfection).toMatch(/breathing motion/i);
      expect(selfie.cameraImperfection).toMatch(/no jitter/i);
      expect(selfie.cameraImperfection).toMatch(/no zoom/i);

      expect(tripod.cameraImperfection).toMatch(/static locked-off/i);
      expect(tripod.cameraImperfection).toMatch(/tripod/i);
      expect(tripod.framingAnchor).toMatch(/phone-on-tripod/i);

      expect(filmedByAnother.cameraImperfection).toMatch(
        /filmed by another person/i,
      );
    });

    it('compiles all four block types into the prompt', () => {
      const preset = UGC_PRESETS.ugc_selfie_handheld;
      const blocks = composeUgcPromptBlocks({
        hasStartFrameReference: false,
        preset,
      });
      const prompt = compileUgcPrompt({
        action: 'creator talking to camera',
        colorPalette: 'natural indoor color',
        hasStartFrameReference: false,
        lighting: 'window light',
        mood: 'casual, direct',
        presetId: preset.id,
        subject: 'young creator in a bedroom',
      });

      expect(prompt).toContain(blocks.microExpression);
      expect(prompt).toContain(blocks.cameraImperfection);
      expect(prompt).toContain(blocks.identityLock);
      expect(prompt).toContain(blocks.framingAnchor);
      expect(prompt).toContain('creator talking to camera');
      expect(prompt).toContain('young creator in a bedroom');
    });
  });

  describe('identity-lock-with-reference', () => {
    it('ties identity lock to the start-frame reference when one is present', () => {
      const preset = UGC_PRESETS.ugc_tripod_vlog;
      const withReference = composeUgcPromptBlocks({
        hasStartFrameReference: true,
        preset,
      });
      const withoutReference = composeUgcPromptBlocks({
        hasStartFrameReference: false,
        preset,
      });

      expect(withReference.identityLock).toMatch(/start-frame reference/i);
      expect(withReference.identityLock).toMatch(/facial proportions/i);
      expect(withoutReference.identityLock).not.toMatch(
        /start-frame reference/i,
      );

      const compiled = compileUgcPrompt({
        action: 'presenter explaining a tip',
        colorPalette: 'neutral daylight',
        hasStartFrameReference: true,
        lighting: 'soft window light',
        mood: 'helpful',
        presetId: preset.id,
        subject: 'creator at a desk',
      });
      expect(compiled).toContain(withReference.identityLock);
      expect(compiled).toMatch(/start-frame reference/i);
    });
  });

  describe('cinematic-vocab-absent', () => {
    it('omits cinematic-gloss vocabulary from every UGC preset block and compiled prompt', () => {
      const presets = getAllUgcPresets();

      presets.forEach((preset: UgcPreset) => {
        expectNoCinematicGloss(preset.name);
        expectNoCinematicGloss(preset.description);

        const blocks = composeUgcPromptBlocks({
          hasStartFrameReference: true,
          preset,
        });
        expectNoCinematicGloss(blocks.microExpression);
        expectNoCinematicGloss(blocks.cameraImperfection);
        expectNoCinematicGloss(blocks.identityLock);
        expectNoCinematicGloss(blocks.framingAnchor);

        const compiled = compileUgcPrompt({
          action: 'talking-head product mention',
          colorPalette: 'everyday room color',
          hasStartFrameReference: true,
          lighting: 'overhead room light',
          mood: 'unpolished, genuine',
          presetId: preset.id,
          subject: 'creator holding a phone',
        });
        expectNoCinematicGloss(compiled);
      });
    });
  });

  describe('lookups', () => {
    it('returns null for unknown or cinematic ids', () => {
      expect(getUgcPresetById('nonexistent_preset')).toBeNull();
      expect(getUgcPresetById('hollywood_blockbuster')).toBeNull();
      expect(isUgcPresetId('hollywood_blockbuster')).toBe(false);
    });
  });

  describe('cinematic-regression-byte-identical', () => {
    it('does not change the cinematic preset family when listing video presets', () => {
      const cinematic = getAllPresets();
      const combined = getAllVideoPresets();

      expect(cinematic).toHaveLength(6);
      expect(combined).toHaveLength(cinematic.length + 3);
      expect(combined.slice(0, cinematic.length)).toEqual(cinematic);
    });
  });
});

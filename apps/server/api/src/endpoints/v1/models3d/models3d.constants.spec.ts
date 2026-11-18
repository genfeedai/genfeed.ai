import {
  buildModels3dSheetPrompt,
  MODELS3D_BUILD_MODEL_KEY,
  MODELS3D_BUILD_TIERS,
  MODELS3D_SHEET_MODEL_KEY,
} from '@api/endpoints/v1/models3d/models3d.constants';

describe('models3d constants', () => {
  it('pins the sheet and build models', () => {
    expect(MODELS3D_SHEET_MODEL_KEY).toBe('google/nano-banana-pro');
    expect(MODELS3D_BUILD_MODEL_KEY).toBe('firtoz/trellis');
  });

  it('builds the standard tier at texture 2048, simplify 0.95 and a fixed seed', () => {
    expect(MODELS3D_BUILD_TIERS.standard.input).toMatchObject({
      generate_model: true,
      mesh_simplify: 0.95,
      randomize_seed: false,
      seed: 42,
      texture_size: 2048,
    });
  });

  it('builds the high tier on Rodin Gen-2 from the photo plus four views', () => {
    expect(MODELS3D_BUILD_TIERS.high).toMatchObject({
      input: { geometry_file_format: 'glb', quality: 'high', tier: 'Gen-2' },
      isPromptRequired: true,
      modelKey: 'hyper3d/rodin',
      viewIndexes: [2, 3, 6, 8],
    });
    expect(MODELS3D_BUILD_TIERS.high.outputKey).toBeUndefined();
  });

  describe('buildModels3dSheetPrompt', () => {
    it('asks for a 3x3 grid of one consistent object', () => {
      const prompt = buildModels3dSheetPrompt();

      expect(prompt).toContain('3x3 grid');
      expect(prompt).toContain('exact same object');
      expect(prompt).not.toContain('The subject is');
    });

    it('adds the trimmed subject when given', () => {
      expect(buildModels3dSheetPrompt('  a two-storey house ')).toContain(
        'The subject is: a two-storey house.',
      );
    });

    it('ignores a blank subject', () => {
      expect(buildModels3dSheetPrompt('   ')).toBe(buildModels3dSheetPrompt());
    });
  });
});

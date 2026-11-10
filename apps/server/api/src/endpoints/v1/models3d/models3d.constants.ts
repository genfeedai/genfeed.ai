import { MODEL_KEYS } from '@genfeedai/contracts/constants';

/** Image model that renders the multi-angle sheet. A harness parameter, so a second tier can be added. */
export const MODELS3D_SHEET_MODEL_KEY =
  MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_PRO;

export const MODELS3D_QUALITIES = ['standard', 'high'] as const;
export type Models3dQuality = (typeof MODELS3D_QUALITIES)[number];
export const MODELS3D_DEFAULT_QUALITY: Models3dQuality = 'standard';

export interface Models3dBuildTier {
  /** Fixed provider input, merged with the source photo and the sheet views. */
  input: Record<string, boolean | number | string>;
  /** Image-to-3D model that builds the GLB from the photo and the sheet views. */
  modelKey: string;
  /** Key of the GLB file inside the prediction output; absent when the output is the file URL. */
  outputKey?: string;
  /** Whether the model's input requires a text prompt beside the images. */
  isPromptRequired?: boolean;
  /** Indexes into the cropped sheet views to send, in order; absent sends them all. */
  viewIndexes?: readonly number[];
}

/** Subject line for tiers whose input requires a prompt. */
export const MODELS3D_DEFAULT_SUBJECT = 'the object shown in the images';

export const MODELS3D_BUILD_TIERS: Record<Models3dQuality, Models3dBuildTier> =
  {
    standard: {
      input: {
        generate_model: true,
        mesh_simplify: 0.95,
        randomize_seed: false,
        seed: 42,
        texture_size: 2048,
      },
      modelKey: MODEL_KEYS.REPLICATE_FIRTOZ_TRELLIS,
      outputKey: 'model_file',
    },
    high: {
      input: {
        geometry_file_format: 'glb',
        material: 'PBR',
        mesh_mode: 'Quad',
        quality: 'high',
        seed: 42,
        tier: 'Gen-2',
      },
      isPromptRequired: true,
      modelKey: MODEL_KEYS.REPLICATE_HYPER3D_RODIN,
      // Rodin takes at most five images: the photo plus the left, right, back and top views.
      viewIndexes: [2, 3, 6, 8],
    },
  };

/** Standard-tier build model, kept for callers that price or label the default. */
export const MODELS3D_BUILD_MODEL_KEY =
  MODELS3D_BUILD_TIERS[MODELS3D_DEFAULT_QUALITY].modelKey;

export const MODELS3D_GRID_SIZE = 3;

/** Index of the centre cell: the original view, already supplied as the photo. */
export const MODELS3D_GRID_CENTER_INDEX = 4;

export const MODELS3D_SHEET_RESOLUTION = '2K';

export const MODELS3D_SHEET_ASPECT_RATIO = '1:1';

/** Longest a single source upload may be, in bytes. */
export const MODELS3D_MAX_SOURCE_BYTES = 10 * 1024 * 1024;

/**
 * Harness prompt for the angle sheet. The reference photo is attached as an
 * input image; the optional caller prompt only describes the subject.
 */
export function buildModels3dSheetPrompt(subject?: string): string {
  const description = subject?.trim()
    ? ` The subject is: ${subject.trim()}.`
    : '';
  return [
    'Create a single square image that is a 3x3 grid of nine views of the exact same object shown in the reference image, with thin equal gaps and a plain neutral light-grey background in every cell.',
    description.trim(),
    'The centre cell repeats the reference view unchanged. The other eight cells show the same object rotated around its vertical axis in 45 degree steps, reading left to right and top to bottom: front-left, front-right, left, right, back-left, back, back-right, plus a high three-quarter view from above.',
    'Keep the object identical in every cell: same proportions, materials, colours, textures and details. Use the same camera distance, the same soft even studio lighting and no shadows cast outside the object. Fit the whole object inside each cell with an equal margin.',
    'No text, labels, numbers, arrows, borders or extra objects.',
  ]
    .filter(Boolean)
    .join(' ');
}

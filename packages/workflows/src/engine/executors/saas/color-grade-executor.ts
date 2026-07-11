import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export type ColorGradeMode = 'preset' | 'custom' | 'ai-style';

export type ColorGradePreset =
  | 'instagram-warm'
  | 'instagram-cool'
  | 'instagram-moody'
  | 'instagram-bright'
  | 'custom';

export interface ColorGradeParams {
  warmth: number;
  contrast: number;
  saturation: number;
  vignette: number;
  grain: number;
  sharpness: number;
}

export interface ColorGradeResult {
  outputImageUrl: string;
  jobId: string;
}

/**
 * Preset configurations mapping to FFmpeg filter parameters.
 * Each preset defines a fixed set of color grading values (0-100 scale).
 */
export const COLOR_GRADE_PRESETS: Record<ColorGradePreset, ColorGradeParams> = {
  custom: {
    contrast: 50,
    grain: 0,
    saturation: 50,
    sharpness: 50,
    vignette: 0,
    warmth: 50,
  },
  'instagram-bright': {
    contrast: 40,
    grain: 5,
    saturation: 55,
    sharpness: 45,
    vignette: 15,
    warmth: 55,
  },
  'instagram-cool': {
    contrast: 55,
    grain: 10,
    saturation: 40,
    sharpness: 40,
    vignette: 25,
    warmth: 30,
  },
  'instagram-moody': {
    contrast: 70,
    grain: 25,
    saturation: 35,
    sharpness: 30,
    vignette: 50,
    warmth: 40,
  },
  'instagram-warm': {
    contrast: 55,
    grain: 15,
    saturation: 45,
    sharpness: 40,
    vignette: 30,
    warmth: 60,
  },
};

/**
 * Builds an FFmpeg filter_complex string from color grade parameters.
 * Parameters are on a 0-100 scale, mapped to FFmpeg-appropriate ranges.
 */
export function buildFfmpegFilterChain(params: ColorGradeParams): string {
  const filters: string[] = [];

  // Contrast: map 0-100 to 0.5-1.5 (eq filter)
  const contrastValue = 0.5 + (params.contrast / 100) * 1.0;
  // Saturation: map 0-100 to 0.5-1.5
  const saturationValue = 0.5 + (params.saturation / 100) * 1.0;
  // Brightness: slight boost based on warmth
  const brightnessValue = (params.warmth - 50) * 0.0004;

  filters.push(
    `eq=contrast=${contrastValue.toFixed(2)}:brightness=${brightnessValue.toFixed(3)}:saturation=${saturationValue.toFixed(2)}`,
  );

  // Warmth via color balance (shift reds up, blues down for warmth)
  const warmthShift = ((params.warmth - 50) / 50) * 0.15;
  if (Math.abs(warmthShift) > 0.01) {
    filters.push(
      `colorbalance=rs=${warmthShift.toFixed(2)}:gs=${(warmthShift * 0.3).toFixed(2)}:bs=${(-warmthShift).toFixed(2)}:rm=${(warmthShift * 0.8).toFixed(2)}:gm=${(warmthShift * 0.3).toFixed(2)}:bm=${(-warmthShift * 0.5).toFixed(2)}`,
    );
  }

  // Vignette: map 0-100 to PI/6 angle
  if (params.vignette > 0) {
    const vignetteAngle = (params.vignette / 100) * (Math.PI / 4);
    filters.push(`vignette=${vignetteAngle.toFixed(3)}`);
  }

  // Sharpness via unsharp mask
  if (params.sharpness > 0) {
    const sharpAmount = (params.sharpness / 100) * 1.5;
    filters.push(`unsharp=5:5:${sharpAmount.toFixed(1)}:5:5:0`);
  }

  // Film grain via noise filter
  if (params.grain > 0) {
    const grainStrength = Math.round((params.grain / 100) * 30);
    filters.push(`noise=alls=${grainStrength}:allf=t`);
  }

  return filters.join(',');
}

export type ColorGradeProcessor = (params: {
  organizationId: string;
  imageUrl: string;
  mode: ColorGradeMode;
  preset: ColorGradePreset;
  filterChain: string;
  styleReferenceImage?: string;
}) => Promise<ColorGradeResult>;

/**
 * Color Grade Executor
 *
 * Applies Instagram-style color grading to images via FFmpeg filters
 * or AI style transfer. Supports preset modes (warm, cool, moody, bright)
 * and custom parameter tuning.
 *
 * Node Type: colorGrade
 * Category: effects
 */
export class ColorGradeExecutor extends BaseExecutor {
  readonly nodeType = 'colorGrade';
  private processor: ColorGradeProcessor | null = null;

  setProcessor(processor: ColorGradeProcessor): void {
    this.processor = processor;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const mode = node.config.mode as ColorGradeMode | undefined;
    if (mode && !['preset', 'custom', 'ai-style'].includes(mode)) {
      errors.push('Invalid mode. Must be: preset, custom, or ai-style');
    }

    const preset = node.config.preset as string | undefined;
    if (
      preset &&
      ![
        'instagram-warm',
        'instagram-cool',
        'instagram-moody',
        'instagram-bright',
        'custom',
      ].includes(preset)
    ) {
      errors.push(
        'Invalid preset. Must be: instagram-warm, instagram-cool, instagram-moody, instagram-bright, or custom',
      );
    }

    const numericFields = [
      'warmth',
      'contrast',
      'saturation',
      'vignette',
      'grain',
      'sharpness',
    ] as const;

    for (const field of numericFields) {
      const value = node.config[field];
      if (
        value !== undefined &&
        (typeof value !== 'number' || value < 0 || value > 100)
      ) {
        errors.push(`${field} must be a number between 0 and 100`);
      }
    }

    if (mode === 'ai-style' && !node.config.styleReferenceImage) {
      errors.push('AI style mode requires a style reference image');
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  estimateCost(node: ExecutableNode): number {
    const mode = node.config.mode as ColorGradeMode | undefined;
    // FFmpeg processing is free, AI style transfer costs credits
    return mode === 'ai-style' ? 5 : 0;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs, context } = input;

    if (!this.processor) {
      throw new Error('Color grade processor not configured');
    }

    const imageUrl = this.getRequiredInput<string>(inputs, 'imageUrl');

    const mode = this.getOptionalConfig<ColorGradeMode>(
      node.config,
      'mode',
      'preset',
    );
    const preset = this.getOptionalConfig<ColorGradePreset>(
      node.config,
      'preset',
      'instagram-warm',
    );

    // Resolve parameters: preset values or custom overrides
    const baseParams =
      mode === 'custom'
        ? COLOR_GRADE_PRESETS.custom
        : COLOR_GRADE_PRESETS[preset];

    const params: ColorGradeParams = {
      contrast: this.getOptionalConfig<number>(
        node.config,
        'contrast',
        baseParams.contrast,
      ),
      grain: this.getOptionalConfig<number>(
        node.config,
        'grain',
        baseParams.grain,
      ),
      saturation: this.getOptionalConfig<number>(
        node.config,
        'saturation',
        baseParams.saturation,
      ),
      sharpness: this.getOptionalConfig<number>(
        node.config,
        'sharpness',
        baseParams.sharpness,
      ),
      vignette: this.getOptionalConfig<number>(
        node.config,
        'vignette',
        baseParams.vignette,
      ),
      warmth: this.getOptionalConfig<number>(
        node.config,
        'warmth',
        baseParams.warmth,
      ),
    };

    const filterChain = buildFfmpegFilterChain(params);

    const styleReferenceImage =
      mode === 'ai-style'
        ? this.getOptionalInput<string | undefined>(
            inputs,
            'styleReferenceImage',
            undefined,
          )
        : undefined;

    const result = await this.processor({
      filterChain,
      imageUrl,
      mode,
      organizationId: context.organizationId,
      preset,
      styleReferenceImage,
    });

    return {
      data: result.outputImageUrl,
      metadata: {
        filterChain,
        jobId: result.jobId,
        mode,
        params,
        preset,
      },
    };
  }
}

export function createColorGradeExecutor(
  processor?: ColorGradeProcessor,
): ColorGradeExecutor {
  const executor = new ColorGradeExecutor();
  if (processor) {
    executor.setProcessor(processor);
  }
  return executor;
}

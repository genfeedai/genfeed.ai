import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CameraProfile =
  | 'arri_logc4'
  | 'red_ippc2'
  | 'sony_slog3'
  | 'canon_clog3'
  | 'bmpcc_film'
  | 'kodak_500t';

export interface CinematicColorGradeConfig {
  cameraProfile: CameraProfile;
  contrast: number; // -100 to 100
  saturation: number; // -100 to 100
  temperature: number; // 2000 to 10000
  shadows: number; // -50 to 50
  midtones: number; // -50 to 50
  highlights: number; // -50 to 50
  customLUT?: string; // URL to .cube file
  lutIntensity: number; // 0-100
}

export interface CinematicColorGradeResult {
  outputVideoUrl: string;
  jobId: string;
}

export type CinematicColorGradeProcessor = (params: {
  organizationId: string;
  videoUrl: string;
  filterChain: string;
  config: CinematicColorGradeConfig;
  customLUT?: string;
}) => Promise<CinematicColorGradeResult>;

// ---------------------------------------------------------------------------
// Camera profile base curves (applied before user adjustments)
// These simulate log-to-rec709 transforms for each camera system.
// ---------------------------------------------------------------------------

export const CAMERA_PROFILE_CURVES: Record<CameraProfile, string> = {
  arri_logc4:
    'curves=r=0/0 0.25/0.20 0.5/0.55 0.75/0.85 1/1:g=0/0 0.25/0.18 0.5/0.52 0.75/0.83 1/1:b=0/0 0.25/0.15 0.5/0.48 0.75/0.80 1/1',
  bmpcc_film:
    'curves=r=0/0 0.2/0.18 0.5/0.54 0.8/0.88 1/1:g=0/0 0.2/0.16 0.5/0.50 0.8/0.85 1/1:b=0/0 0.2/0.14 0.5/0.46 0.8/0.80 1/1',
  canon_clog3:
    'curves=r=0/0 0.25/0.22 0.5/0.52 0.75/0.82 1/1:g=0/0 0.25/0.20 0.5/0.50 0.75/0.80 1/1:b=0/0 0.25/0.18 0.5/0.48 0.75/0.78 1/1',
  kodak_500t:
    'curves=r=0/0.02 0.25/0.22 0.5/0.55 0.75/0.82 1/0.98:g=0/0.01 0.25/0.18 0.5/0.48 0.75/0.78 1/0.96:b=0/0 0.25/0.15 0.5/0.42 0.75/0.72 1/0.92',
  red_ippc2:
    'curves=r=0/0 0.2/0.15 0.5/0.55 0.8/0.90 1/1:g=0/0 0.2/0.12 0.5/0.50 0.8/0.88 1/1:b=0/0 0.2/0.10 0.5/0.45 0.8/0.82 1/1',
  sony_slog3:
    'curves=r=0/0 0.3/0.22 0.5/0.50 0.7/0.78 1/1:g=0/0 0.3/0.20 0.5/0.48 0.7/0.76 1/1:b=0/0 0.3/0.18 0.5/0.46 0.7/0.74 1/1',
};

// ---------------------------------------------------------------------------
// Filter chain builder
// ---------------------------------------------------------------------------

/**
 * Builds a cinematic FFmpeg filter chain from color grade config.
 *
 * Pipeline order:
 *   1. Camera profile curve (log-to-display transform)
 *   2. Color balance (shadows / midtones / highlights + temperature)
 *   3. Eq (contrast + saturation)
 *   4. LUT (if provided, blended at lutIntensity)
 */
export function buildCinematicColorGradeFilterChain(
  config: CinematicColorGradeConfig,
): string {
  const filters: string[] = [];

  // 1. Camera profile curves
  filters.push(CAMERA_PROFILE_CURVES[config.cameraProfile]);

  // 2. Color balance from shadows / midtones / highlights + temperature
  const tempShift = (config.temperature - 6500) / 8000; // neutral = 6500K
  const shadowR = (config.shadows / 50) * 0.15 + tempShift * 0.1;
  const shadowB = (-config.shadows / 50) * 0.1 - tempShift * 0.1;
  const midR = (config.midtones / 50) * 0.12 + tempShift * 0.08;
  const midB = (-config.midtones / 50) * 0.08 - tempShift * 0.08;
  const highR = (config.highlights / 50) * 0.1 + tempShift * 0.06;
  const highB = (-config.highlights / 50) * 0.06 - tempShift * 0.06;

  filters.push(
    `colorbalance=rs=${shadowR.toFixed(3)}:bs=${shadowB.toFixed(3)}:rm=${midR.toFixed(3)}:bm=${midB.toFixed(3)}:rh=${highR.toFixed(3)}:bh=${highB.toFixed(3)}`,
  );

  // 3. Contrast & saturation via eq
  const contrastVal = 1 + config.contrast / 100; // -100→0, 0→1, 100→2
  const satVal = 1 + config.saturation / 100;
  filters.push(
    `eq=contrast=${contrastVal.toFixed(2)}:saturation=${satVal.toFixed(2)}`,
  );

  // 4. LUT application (only if customLUT is provided)
  // The actual LUT loading is handled by the processor; we just signal it
  // via the filter chain with a placeholder that the processor replaces.
  if (config.customLUT && config.lutIntensity > 0) {
    const intensity = config.lutIntensity / 100;
    // split → lut3d → merge at intensity via blend
    filters.push(
      `split[cg_main][cg_lut];[cg_lut]lut3d='${config.customLUT}'[cg_luted];[cg_main][cg_luted]blend=all_mode=normal:all_opacity=${intensity.toFixed(2)}`,
    );
  }

  return filters.join(',');
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_CAMERA_PROFILES: CameraProfile[] = [
  'arri_logc4',
  'red_ippc2',
  'sony_slog3',
  'canon_clog3',
  'bmpcc_film',
  'kodak_500t',
];

function validateRange(
  value: unknown,
  field: string,
  min: number,
  max: number,
  errors: string[],
): void {
  if (
    value !== undefined &&
    (typeof value !== 'number' || value < min || value > max)
  ) {
    errors.push(`${field} must be a number between ${min} and ${max}`);
  }
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

/**
 * Cinematic Color Grade Executor
 *
 * Applies cinematic-grade color grading using camera profile curves,
 * 3-way color balance (shadows / midtones / highlights), temperature
 * control, and optional LUT application.
 *
 * Node Type: cinematicColorGrade
 * Category: processing
 */
export class CinematicColorGradeExecutor extends BaseExecutor {
  readonly nodeType = 'cinematicColorGrade';
  private processor: CinematicColorGradeProcessor | null = null;

  setProcessor(processor: CinematicColorGradeProcessor): void {
    this.processor = processor;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const base = super.validate(node);
    const errors = [...base.errors];

    const profile = node.config.cameraProfile as string | undefined;
    if (profile && !VALID_CAMERA_PROFILES.includes(profile as CameraProfile)) {
      errors.push(
        `Invalid cameraProfile. Must be one of: ${VALID_CAMERA_PROFILES.join(', ')}`,
      );
    }

    validateRange(node.config.contrast, 'contrast', -100, 100, errors);
    validateRange(node.config.saturation, 'saturation', -100, 100, errors);
    validateRange(node.config.temperature, 'temperature', 2000, 10000, errors);
    validateRange(node.config.shadows, 'shadows', -50, 50, errors);
    validateRange(node.config.midtones, 'midtones', -50, 50, errors);
    validateRange(node.config.highlights, 'highlights', -50, 50, errors);
    validateRange(node.config.lutIntensity, 'lutIntensity', 0, 100, errors);

    return { errors, valid: errors.length === 0 };
  }

  estimateCost(_node: ExecutableNode): number {
    return 2; // Video processing credits
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs, context } = input;

    if (!this.processor) {
      throw new Error('Cinematic color grade processor not configured');
    }

    const videoUrl = this.getRequiredInput<string>(inputs, 'videoUrl');

    const config: CinematicColorGradeConfig = {
      cameraProfile: this.getOptionalConfig<CameraProfile>(
        node.config,
        'cameraProfile',
        'arri_logc4',
      ),
      contrast: this.getOptionalConfig<number>(node.config, 'contrast', 0),
      customLUT: this.getOptionalConfig<string | undefined>(
        node.config,
        'customLUT',
        undefined,
      ),
      highlights: this.getOptionalConfig<number>(node.config, 'highlights', 0),
      lutIntensity: this.getOptionalConfig<number>(
        node.config,
        'lutIntensity',
        100,
      ),
      midtones: this.getOptionalConfig<number>(node.config, 'midtones', 0),
      saturation: this.getOptionalConfig<number>(node.config, 'saturation', 0),
      shadows: this.getOptionalConfig<number>(node.config, 'shadows', 0),
      temperature: this.getOptionalConfig<number>(
        node.config,
        'temperature',
        6500,
      ),
    };

    const filterChain = buildCinematicColorGradeFilterChain(config);

    const result = await this.processor({
      config,
      customLUT: config.customLUT,
      filterChain,
      organizationId: context.organizationId,
      videoUrl,
    });

    return {
      data: result.outputVideoUrl,
      metadata: {
        cameraProfile: config.cameraProfile,
        filterChain,
        jobId: result.jobId,
      },
    };
  }
}

export function createCinematicColorGradeExecutor(
  processor?: CinematicColorGradeProcessor,
): CinematicColorGradeExecutor {
  const executor = new CinematicColorGradeExecutor();
  if (processor) {
    executor.setProcessor(processor);
  }
  return executor;
}

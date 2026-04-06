import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VignetteConfig {
  enabled: boolean;
  intensity: number; // 0-100
  softness: number; // 0-100
}

export interface ChromaticAberrationConfig {
  enabled: boolean;
  intensity: number; // 0-100
}

export interface BarrelDistortionConfig {
  enabled: boolean;
  amount: number; // -100 to 100
}

export interface BloomConfig {
  enabled: boolean;
  threshold: number; // 0-100
  intensity: number; // 0-100
}

export interface LensEffectsConfig {
  vignette: VignetteConfig;
  chromaticAberration: ChromaticAberrationConfig;
  barrelDistortion: BarrelDistortionConfig;
  bloom: BloomConfig;
}

export interface LensEffectsResult {
  outputVideoUrl: string;
  jobId: string;
}

export type LensEffectsProcessor = (params: {
  organizationId: string;
  videoUrl: string;
  filterChain: string;
  config: LensEffectsConfig;
}) => Promise<LensEffectsResult>;

// ---------------------------------------------------------------------------
// Filter chain builder
// ---------------------------------------------------------------------------

/**
 * Builds an FFmpeg filter chain for lens effects.
 *
 * Pipeline (each effect is optional):
 *   1. Vignette
 *   2. Chromatic aberration (rgbashift)
 *   3. Barrel distortion (lenscorrection)
 *   4. Bloom (threshold → blur → blend)
 */
export function buildLensEffectsFilterChain(config: LensEffectsConfig): string {
  const filters: string[] = [];

  // 1. Vignette
  if (config.vignette.enabled && config.vignette.intensity > 0) {
    const angle = (config.vignette.intensity / 100) * (Math.PI / 4);
    // Softness controls the vignette aspect — higher = wider soft edge
    const aspect = 0.3 + (config.vignette.softness / 100) * 0.7;
    filters.push(
      `vignette=angle=${angle.toFixed(4)}:x0=iw/2:y0=ih/2:mode=forward:aspect=${aspect.toFixed(2)}`,
    );
  }

  // 2. Chromatic aberration via rgbashift
  if (
    config.chromaticAberration.enabled &&
    config.chromaticAberration.intensity > 0
  ) {
    const shift = Math.round((config.chromaticAberration.intensity / 100) * 8);
    filters.push(
      `rgbashift=rh=${-shift}:bh=${shift}:rv=${Math.round(shift * 0.3)}:bv=${Math.round(-shift * 0.3)}`,
    );
  }

  // 3. Barrel distortion via lenscorrection
  if (config.barrelDistortion.enabled && config.barrelDistortion.amount !== 0) {
    const k1 = (config.barrelDistortion.amount / 100) * -0.3;
    const k2 = (config.barrelDistortion.amount / 100) * -0.05;
    filters.push(`lenscorrection=k1=${k1.toFixed(4)}:k2=${k2.toFixed(4)}`);
  }

  // 4. Bloom effect (split → threshold → blur → blend)
  if (config.bloom.enabled && config.bloom.intensity > 0) {
    const thresholdVal = Math.round(255 - (config.bloom.threshold / 100) * 200);
    const blurSize = Math.round(10 + (config.bloom.intensity / 100) * 40);
    const opacity = (config.bloom.intensity / 100) * 0.6;
    filters.push(
      `split[le_main][le_bloom];[le_bloom]lutyuv=y='if(gt(val,${thresholdVal}),val,0)',gblur=sigma=${blurSize}[le_bloomed];[le_main][le_bloomed]blend=all_mode=screen:all_opacity=${opacity.toFixed(2)}`,
    );
  }

  if (filters.length === 0) {
    return 'null'; // FFmpeg passthrough
  }

  return filters.join(',');
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateSubConfig(
  obj: unknown,
  name: string,
  fields: Array<{ key: string; min: number; max: number }>,
  errors: string[],
): void {
  if (obj === undefined) return;
  if (typeof obj !== 'object' || obj === null) {
    errors.push(`${name} must be an object`);
    return;
  }
  const rec = obj as Record<string, unknown>;
  for (const { key, min, max } of fields) {
    const val = rec[key];
    if (
      val !== undefined &&
      (typeof val !== 'number' || val < min || val > max)
    ) {
      errors.push(`${name}.${key} must be a number between ${min} and ${max}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

/**
 * Lens Effects Executor
 *
 * Applies cinematic lens effects: vignette, chromatic aberration,
 * barrel distortion, and bloom via FFmpeg filters.
 *
 * Node Type: lensEffects
 * Category: processing
 */
export class LensEffectsExecutor extends BaseExecutor {
  readonly nodeType = 'lensEffects';
  private processor: LensEffectsProcessor | null = null;

  setProcessor(processor: LensEffectsProcessor): void {
    this.processor = processor;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const base = super.validate(node);
    const errors = [...base.errors];

    validateSubConfig(
      node.config.vignette,
      'vignette',
      [
        { key: 'intensity', max: 100, min: 0 },
        { key: 'softness', max: 100, min: 0 },
      ],
      errors,
    );

    validateSubConfig(
      node.config.chromaticAberration,
      'chromaticAberration',
      [{ key: 'intensity', max: 100, min: 0 }],
      errors,
    );

    validateSubConfig(
      node.config.barrelDistortion,
      'barrelDistortion',
      [{ key: 'amount', max: 100, min: -100 }],
      errors,
    );

    validateSubConfig(
      node.config.bloom,
      'bloom',
      [
        { key: 'threshold', max: 100, min: 0 },
        { key: 'intensity', max: 100, min: 0 },
      ],
      errors,
    );

    return { errors, valid: errors.length === 0 };
  }

  estimateCost(_node: ExecutableNode): number {
    return 2;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs, context } = input;

    if (!this.processor) {
      throw new Error('Lens effects processor not configured');
    }

    const videoUrl = this.getRequiredInput<string>(inputs, 'videoUrl');

    const _defaultSub = { enabled: false, intensity: 0 };

    const config: LensEffectsConfig = {
      barrelDistortion: {
        amount: 0,
        enabled: false,
        ...(node.config.barrelDistortion as
          | Partial<BarrelDistortionConfig>
          | undefined),
      },
      bloom: {
        enabled: false,
        intensity: 0,
        threshold: 80,
        ...(node.config.bloom as Partial<BloomConfig> | undefined),
      },
      chromaticAberration: {
        enabled: false,
        intensity: 0,
        ...(node.config.chromaticAberration as
          | Partial<ChromaticAberrationConfig>
          | undefined),
      },
      vignette: {
        enabled: true,
        intensity: 0,
        softness: 50,
        ...(node.config.vignette as Partial<VignetteConfig> | undefined),
      },
    };

    const filterChain = buildLensEffectsFilterChain(config);

    const result = await this.processor({
      config,
      filterChain,
      organizationId: context.organizationId,
      videoUrl,
    });

    return {
      data: result.outputVideoUrl,
      metadata: {
        filterChain,
        jobId: result.jobId,
      },
    };
  }
}

export function createLensEffectsExecutor(
  processor?: LensEffectsProcessor,
): LensEffectsExecutor {
  const executor = new LensEffectsExecutor();
  if (processor) {
    executor.setProcessor(processor);
  }
  return executor;
}

import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export type FilmStock =
  | '35mm_fine'
  | '35mm_heavy'
  | '16mm'
  | '8mm'
  | 'digital_noise';

export type GrainSize = 'fine' | 'medium' | 'coarse';

export interface FilmGrainParams {
  stock: FilmStock;
  intensity: number;
  size: GrainSize;
  colorGrain: boolean;
}

/** Extended config used by cinematic camera presets */
export interface FilmGrainConfig extends FilmGrainParams {
  enabled?: boolean;
  animateGrain?: boolean;
}

export interface FilmGrainResult {
  outputUrl: string;
  jobId: string;
}

/**
 * Stock preset mappings to FFmpeg noise parameters.
 */
const STOCK_PRESETS: Record<
  FilmStock,
  { strength: number; temporal: boolean; heavyTemporal: boolean }
> = {
  '8mm': { heavyTemporal: true, strength: 25, temporal: true },
  '16mm': { heavyTemporal: false, strength: 20, temporal: true },
  '35mm_fine': { heavyTemporal: false, strength: 10, temporal: true },
  '35mm_heavy': { heavyTemporal: false, strength: 30, temporal: true },
  digital_noise: { heavyTemporal: false, strength: 15, temporal: false },
};

const SIZE_MULTIPLIERS: Record<GrainSize, number> = {
  coarse: 1.4,
  fine: 0.7,
  medium: 1.0,
};

const VALID_STOCKS: FilmStock[] = [
  '35mm_fine',
  '35mm_heavy',
  '16mm',
  '8mm',
  'digital_noise',
];

const VALID_SIZES: GrainSize[] = ['fine', 'medium', 'coarse'];

/**
 * Builds an FFmpeg filter string for film grain simulation.
 */
export function buildFilmGrainFilter(params: FilmGrainParams): string {
  const preset = STOCK_PRESETS[params.stock];
  const sizeMultiplier = SIZE_MULTIPLIERS[params.size];

  const baseStrength =
    preset.strength * (params.intensity / 100) * sizeMultiplier;
  const strength = Math.max(0, Math.min(100, Math.round(baseStrength)));

  if (strength === 0) return '';

  const flags: string[] = [];
  if (preset.temporal) flags.push('t');
  flags.push('u');
  const flagStr = flags.join('+');

  const filters: string[] = [];

  if (!params.colorGrain) {
    filters.push(`noise=alls=${strength}:allf=${flagStr}`);
  } else {
    const rStrength = strength;
    const gStrength = Math.round(strength * 0.85);
    const bStrength = Math.round(strength * 0.9);
    filters.push(
      `noise=c0s=${rStrength}:c0f=${flagStr}:c1s=${gStrength}:c1f=${flagStr}:c2s=${bStrength}:c2f=${flagStr}`,
    );
  }

  if (preset.heavyTemporal) {
    filters.push('tmix=frames=2:weights=1 0.5');
  }

  return filters.join(',');
}

export type FilmGrainProcessor = (params: {
  organizationId: string;
  videoUrl: string;
  filterChain: string;
  stock: FilmStock;
  intensity: number;
}) => Promise<FilmGrainResult>;

/**
 * Film Grain Executor
 *
 * Applies cinematic film grain to video via FFmpeg noise filters.
 * Supports stock emulation (35mm, 16mm, 8mm) and digital noise,
 * with configurable intensity, size, and chromatic grain toggle.
 *
 * Node Type: filmGrain
 * Category: effects
 */
export class FilmGrainExecutor extends BaseExecutor {
  readonly nodeType = 'filmGrain';
  private processor: FilmGrainProcessor | null = null;

  setProcessor(processor: FilmGrainProcessor): void {
    this.processor = processor;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];

    const stock = node.config.stock as string | undefined;
    if (stock && !VALID_STOCKS.includes(stock as FilmStock)) {
      errors.push(`Invalid stock. Must be one of: ${VALID_STOCKS.join(', ')}`);
    }

    const intensity = node.config.intensity;
    if (
      intensity !== undefined &&
      (typeof intensity !== 'number' || intensity < 0 || intensity > 100)
    ) {
      errors.push('intensity must be a number between 0 and 100');
    }

    const size = node.config.size as string | undefined;
    if (size && !VALID_SIZES.includes(size as GrainSize)) {
      errors.push(`Invalid size. Must be one of: ${VALID_SIZES.join(', ')}`);
    }

    const colorGrain = node.config.colorGrain;
    if (colorGrain !== undefined && typeof colorGrain !== 'boolean') {
      errors.push('colorGrain must be a boolean');
    }

    return {
      errors,
      valid: errors.length === 0,
    };
  }

  estimateCost(_node: ExecutableNode): number {
    return 0;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { node, inputs, context } = input;

    if (!this.processor) {
      throw new Error('Film grain processor not configured');
    }

    const videoUrl = this.getRequiredInput<string>(inputs, 'videoUrl');

    const stock = this.getOptionalConfig<FilmStock>(
      node.config,
      'stock',
      '35mm_fine',
    );
    const intensity = this.getOptionalConfig<number>(
      node.config,
      'intensity',
      50,
    );
    const size = this.getOptionalConfig<GrainSize>(
      node.config,
      'size',
      'medium',
    );
    const colorGrain = this.getOptionalConfig<boolean>(
      node.config,
      'colorGrain',
      false,
    );

    const params: FilmGrainParams = { colorGrain, intensity, size, stock };
    const filterChain = buildFilmGrainFilter(params);

    const result = await this.processor({
      filterChain,
      intensity,
      organizationId: context.organizationId,
      stock,
      videoUrl,
    });

    return {
      data: result.outputUrl,
      metadata: {
        filterChain,
        jobId: result.jobId,
        params,
        stock,
      },
    };
  }
}

export function createFilmGrainExecutor(
  processor?: FilmGrainProcessor,
): FilmGrainExecutor {
  const executor = new FilmGrainExecutor();
  if (processor) {
    executor.setProcessor(processor);
  }
  return executor;
}

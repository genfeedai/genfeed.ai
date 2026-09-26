import {
  MEDIA_PERCEPTION_DEFAULT_FRAME_COUNT,
  MEDIA_PERCEPTION_MAX_FRAME_COUNT,
} from '@genfeedai/contracts/api-types/contracts';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import type { ConfigService } from '@libs/config/config.service';

const DEFAULT_LOOKBACK_HOURS = 24;
const MAX_LOOKBACK_HOURS = 720;

export interface MediaPerceptionSettings {
  frameCount: number;
  isEnabled: boolean;
  lookbackHours: number;
  visionModel: string;
}

function readBoundedInteger(
  raw: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

/**
 * The one place the MEDIA_PERCEPTION_* keys are read (#4879). Joi validates
 * them at boot; the guards keep a hand-built ConfigService honest.
 */
export function resolveMediaPerceptionSettings(
  configService: ConfigService,
): MediaPerceptionSettings {
  const visionModel = String(
    configService.get('MEDIA_PERCEPTION_VISION_MODEL') ?? '',
  ).trim();

  return {
    frameCount: readBoundedInteger(
      configService.get('MEDIA_PERCEPTION_FRAME_COUNT'),
      1,
      MEDIA_PERCEPTION_MAX_FRAME_COUNT,
      MEDIA_PERCEPTION_DEFAULT_FRAME_COUNT,
    ),
    isEnabled:
      String(configService.get('MEDIA_PERCEPTION_ENABLED') ?? 'true')
        .trim()
        .toLowerCase() !== 'false',
    lookbackHours: readBoundedInteger(
      configService.get('MEDIA_PERCEPTION_LOOKBACK_HOURS'),
      1,
      MAX_LOOKBACK_HOURS,
      DEFAULT_LOOKBACK_HOURS,
    ),
    visionModel: visionModel || LLM_DEFAULTS.fastText,
  };
}

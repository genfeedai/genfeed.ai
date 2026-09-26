import { ModerationCategory } from '@genfeedai/contracts';
import {
  DEFAULT_MODERATION_THRESHOLDS,
  type MediaGateMode,
} from '@genfeedai/contracts/api-types/contracts';
import type { ModerationProviderName } from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';

export interface ModerationSettings {
  mode: MediaGateMode;
  provider: ModerationProviderName;
  thresholds: Readonly<Record<ModerationCategory, number>>;
  /** Override entries that named no known category, for a boot-time warning. */
  unknownThresholdKeys: string[];
}

const CATEGORY_VALUES = new Set<string>(Object.values(ModerationCategory));

function isCategory(value: string): value is ModerationCategory {
  return CATEGORY_VALUES.has(value);
}

/**
 * Parse `category=confidence` pairs over the contract defaults. Joi validates
 * the shape at boot; an unknown category is reported, never silently kept.
 */
export function parseModerationThresholds(raw: unknown): {
  thresholds: Record<ModerationCategory, number>;
  unknownKeys: string[];
} {
  const thresholds = { ...DEFAULT_MODERATION_THRESHOLDS };
  const unknownKeys: string[] = [];
  for (const pair of String(raw ?? '').split(',')) {
    const [rawKey, rawValue] = pair.split('=');
    const key = rawKey?.trim() ?? '';
    const value = Number(rawValue?.trim());
    if (!key) {
      continue;
    }
    if (!isCategory(key)) {
      unknownKeys.push(key);
      continue;
    }
    if (Number.isFinite(value) && value >= 0 && value <= 1) {
      thresholds[key] = value;
    }
  }
  return { thresholds, unknownKeys };
}

/** The one place the MODERATION_* keys are read (#4880). */
export function resolveModerationSettings(
  configService: ConfigService,
): ModerationSettings {
  const rawProvider = String(configService.get('MODERATION_PROVIDER') ?? '')
    .trim()
    .toLowerCase();
  const rawMode = String(configService.get('MODERATION_MODE') ?? '')
    .trim()
    .toLowerCase();
  const { thresholds, unknownKeys } = parseModerationThresholds(
    configService.get('MODERATION_THRESHOLDS'),
  );
  return {
    // Anything but an explicit, known provider keeps media on the host.
    mode:
      rawMode === 'live' || rawMode === 'off' || rawMode === 'shadow'
        ? rawMode
        : 'shadow',
    provider: rawProvider === 'openai' ? 'openai' : 'none',
    thresholds,
    unknownThresholdKeys: unknownKeys,
  };
}

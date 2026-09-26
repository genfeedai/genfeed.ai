import { createHash } from 'node:crypto';
import type { TypedDecisionRolloutSettings } from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';

export const MEDIA_TEXT_GATE_DEFAULT_MIN_CONFIDENCE = 0.85;

/** Async worker path: decisions may take longer than the chat-turn budget. */
export const MEDIA_TEXT_DECISION_TIMEOUT_MS = 15_000;

/** The one place the MEDIA_TEXT_GATE_* keys are read (#4882). */
export function resolveMediaTextGateSettings(
  configService: ConfigService,
): TypedDecisionRolloutSettings {
  const rawMode = String(
    configService.get('MEDIA_TEXT_GATE_DECISION_MODE') ?? '',
  )
    .trim()
    .toLowerCase();
  const rawConfidence = Number(
    configService.get('MEDIA_TEXT_GATE_MIN_CONFIDENCE'),
  );
  return {
    minConfidence:
      Number.isFinite(rawConfidence) && rawConfidence >= 0 && rawConfidence <= 1
        ? rawConfidence
        : MEDIA_TEXT_GATE_DEFAULT_MIN_CONFIDENCE,
    mode: rawMode === 'live' || rawMode === 'shadow' ? rawMode : 'off',
  };
}

/** Subject key for one posted caption; whitespace-insensitive at the ends. */
export function captionSubjectKey(caption: string): string {
  return `caption:${createHash('sha256').update(caption.trim()).digest('hex')}`;
}

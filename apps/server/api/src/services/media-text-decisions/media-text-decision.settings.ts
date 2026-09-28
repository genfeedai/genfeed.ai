import { createHash } from 'node:crypto';
import type {
  IPlatformFeatureSettings,
  TypedDecisionRolloutSettings,
} from '@genfeedai/contracts/interfaces';

/** Async worker path: decisions may take longer than the chat-turn budget. */
export const MEDIA_TEXT_DECISION_TIMEOUT_MS = 15_000;

/** The media text-gate rollout (#4882), an operator platform setting (#5407). */
export function resolveMediaTextGateSettings(
  settings: IPlatformFeatureSettings,
): TypedDecisionRolloutSettings {
  return {
    minConfidence: settings.mediaTextGateMinConfidence,
    mode: settings.mediaTextGateDecisionMode,
  };
}

/** Subject key for one posted caption; whitespace-insensitive at the ends. */
export function captionSubjectKey(caption: string): string {
  return `caption:${createHash('sha256').update(caption.trim()).digest('hex')}`;
}

import { ModelProvider } from '@genfeedai/contracts';
import {
  getModelMaxAudioReferences,
  hasAudioReferences,
} from '@genfeedai/contracts/constants';
import { BadRequestException } from '@nestjs/common';

/** Model-level limits from https://www.minimax.io/news/minimax-h3-open-source (2026-10-23). */
export function assertMinimaxH3ReferenceDurations(
  durations: readonly number[],
  kind: 'audio' | 'video',
): void {
  if (
    durations.some(
      (seconds) => !Number.isFinite(seconds) || seconds < 2 || seconds > 15,
    ) ||
    durations.reduce((sum, seconds) => sum + seconds, 0) > 15
  ) {
    throw new BadRequestException(
      `MiniMax H3 ${kind} references must each be 2–15 seconds and total at most 15 seconds`,
    );
  }
}

export function assertAudioReferencesSupported(
  model: string,
  references: readonly string[],
  provider?: string,
): void {
  if (!references.length) return;
  if (
    !hasAudioReferences(model) ||
    (provider !== undefined && provider !== ModelProvider.REPLICATE)
  ) {
    throw new BadRequestException(
      'The selected model does not support audio references',
    );
  }
  if (references.length > getModelMaxAudioReferences(model)) {
    throw new BadRequestException(
      'Too many audio references for the selected model',
    );
  }
}

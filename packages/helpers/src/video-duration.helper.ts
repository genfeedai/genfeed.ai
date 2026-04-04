import {
  getModelDefaultDuration,
  getModelDurations,
} from '@genfeedai/constants';
import type { ModelKey } from '@genfeedai/enums';

export function formatDuration(seconds?: number | null): string {
  if (!seconds) {
    return '0:00';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const paddedMinutes = minutes.toString().padStart(2, '0');
  const paddedSecs = secs.toString().padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${paddedMinutes}:${paddedSecs}`;
  }
  return `${minutes}:${paddedSecs}`;
}

export class DurationUtil {
  static validateAndNormalize(
    requestedDuration: number | undefined,
    allowedDurations: number[],
    defaultDuration?: number,
  ): number {
    if (!requestedDuration) {
      return defaultDuration ?? allowedDurations[0];
    }

    if (allowedDurations.includes(requestedDuration)) {
      return requestedDuration;
    }

    return allowedDurations.reduce((prev, curr) =>
      Math.abs(curr - requestedDuration) < Math.abs(prev - requestedDuration)
        ? curr
        : prev,
    );
  }

  static validateSoraDuration(requestedDuration?: number): number {
    return DurationUtil.validateAndNormalize(requestedDuration, [4, 8, 12], 4);
  }

  static validateVeoDuration(
    requestedDuration?: number,
    allowedDurations: number[] = [5, 8],
    defaultDuration: number = 8,
  ): number {
    return DurationUtil.validateAndNormalize(
      requestedDuration,
      allowedDurations,
      defaultDuration,
    );
  }

  static validateDurationForModel(
    model: ModelKey,
    requestedDuration?: number,
  ): number {
    const allowedDurations = getModelDurations(model);
    const defaultDuration = getModelDefaultDuration(model);

    if (allowedDurations.length === 0) {
      return requestedDuration || defaultDuration || 8;
    }

    return DurationUtil.validateAndNormalize(
      requestedDuration,
      [...allowedDurations],
      defaultDuration,
    );
  }
}

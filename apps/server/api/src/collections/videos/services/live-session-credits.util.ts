import {
  LIVE_SESSION_MAX_CEILING_SECONDS,
  LIVE_SESSION_MIN_CEILING_SECONDS,
} from '@genfeedai/contracts/constants';
import { BadRequestException } from '@nestjs/common';

export function assertLiveSessionCeilingSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new BadRequestException('A session length ceiling is required');
  }
  if (
    value < LIVE_SESSION_MIN_CEILING_SECONDS ||
    value > LIVE_SESSION_MAX_CEILING_SECONDS
  ) {
    throw new BadRequestException(
      `Session length ceiling must be between ${LIVE_SESSION_MIN_CEILING_SECONDS} and ${LIVE_SESSION_MAX_CEILING_SECONDS} seconds`,
    );
  }
  return value;
}

export function liveSessionElapsedSeconds(params: {
  ceilingSeconds: number;
  now: Date;
  startedAt: Date;
}): number {
  const elapsedMs = params.now.getTime() - params.startedAt.getTime();
  const elapsed = Math.ceil(elapsedMs / 1000);
  return Math.min(params.ceilingSeconds, Math.max(0, elapsed));
}

export function isLiveSessionPastCeiling(params: {
  ceilingEndsAt: Date;
  now: Date;
}): boolean {
  return params.now.getTime() >= params.ceilingEndsAt.getTime();
}

import type { CreditsConfig } from '@genfeedai/interfaces';
import { SetMetadata } from '@nestjs/common';

export const CREDITS_KEY = 'credits';
export const CREDITS_DEFER_MODEL_RESOLUTION_KEY =
  'credits.deferModelResolution';

export const Credits = (config: CreditsConfig) =>
  SetMetadata(CREDITS_KEY, config);

export const DeferCreditsUntilModelResolution = () =>
  SetMetadata(CREDITS_DEFER_MODEL_RESOLUTION_KEY, true);

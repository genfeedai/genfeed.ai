import type { MediaGateMode } from '@genfeedai/contracts/api-types/contracts';
import type { IPlatformFeatureSettings } from '@genfeedai/contracts/interfaces';

/** The vision-evaluation gate mode (#4881), an operator platform setting (#5407). */
export function resolveVisionGateMode(
  settings: IPlatformFeatureSettings,
): MediaGateMode {
  return settings.mediaGateVisionMode;
}

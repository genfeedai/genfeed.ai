import type { MediaGateMode } from '@genfeedai/contracts/api-types/contracts';
import type { ConfigService } from '@libs/config/config.service';

/** The one place MEDIA_GATE_VISION_MODE is read (#4881). Unknown → `off`. */
export function resolveVisionGateMode(
  configService: ConfigService,
): MediaGateMode {
  const raw = String(configService.get('MEDIA_GATE_VISION_MODE') ?? '')
    .trim()
    .toLowerCase();
  return raw === 'live' || raw === 'shadow' ? raw : 'off';
}

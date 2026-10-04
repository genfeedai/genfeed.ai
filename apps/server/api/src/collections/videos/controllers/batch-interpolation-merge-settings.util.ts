import type { InterpolationMergeSettingsDto } from '@api/collections/videos/dto/batch-interpolation.dto';
import type { IVideoMergeSettings } from '@genfeedai/contracts/interfaces';

/** Plain JSON copy of the settings captured when the batch starts. */
export function toVideoMergeSettings(
  settings: InterpolationMergeSettingsDto,
): IVideoMergeSettings {
  return {
    ...(settings.isCaptionsEnabled !== undefined
      ? { isCaptionsEnabled: settings.isCaptionsEnabled }
      : {}),
    ...(settings.isMuteVideoAudio !== undefined
      ? { isMuteVideoAudio: settings.isMuteVideoAudio }
      : {}),
    ...(settings.music ? { music: settings.music } : {}),
    ...(settings.musicVolume !== undefined
      ? { musicVolume: settings.musicVolume }
      : {}),
    ...(settings.transition ? { transition: settings.transition } : {}),
    ...(settings.transitionDuration !== undefined
      ? { transitionDuration: settings.transitionDuration }
      : {}),
    ...(settings.transitionEaseCurve
      ? { transitionEaseCurve: settings.transitionEaseCurve }
      : {}),
  };
}

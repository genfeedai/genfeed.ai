import type { VoiceProvider } from '@genfeedai/contracts';
import {
  getVoiceSpeechModel,
  SPEECH_VOICE_PROVIDERS,
} from '@genfeedai/contracts/constants';
import type { StudioPlaygroundSettings } from '@pages/studio/playground/types';

/**
 * The voice provider a chosen speech model can speak, or `undefined` when the
 * model key is Auto (or not a speech model) and any speech voice is allowed.
 */
export function resolveSpeakingVoiceProvider(
  modelKey: string | undefined,
): VoiceProvider | undefined {
  return getVoiceSpeechModel(modelKey)?.voiceProvider;
}

/** The saved voice's provider when Studio can speak it; otherwise `undefined`. */
export function resolveSpeechVoiceProvider(
  voiceRef: StudioPlaygroundSettings['voiceRef'],
): VoiceProvider | undefined {
  return SPEECH_VOICE_PROVIDERS.find(
    (provider) => provider === voiceRef?.provider,
  );
}

/**
 * Whether the saved Voice pick can still be sent. It must carry its provider
 * (the server needs `voiceProvider`), that provider must be one Studio speaks,
 * and an explicit speech model must be able to speak it.
 */
export function isStudioVoiceSelectionValid(
  settings: Pick<StudioPlaygroundSettings, 'modelKey' | 'voiceId' | 'voiceRef'>,
): boolean {
  if (!settings.voiceId) {
    return true;
  }

  const provider = resolveSpeechVoiceProvider(settings.voiceRef);
  if (!provider) {
    return false;
  }

  const speakingProvider = resolveSpeakingVoiceProvider(settings.modelKey);
  return !speakingProvider || speakingProvider === provider;
}

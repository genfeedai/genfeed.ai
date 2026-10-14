import type { ElevenLabs } from '@elevenlabs/elevenlabs-js';
import type { ElevenLabsVoiceAvailability } from '@genfeedai/contracts/interfaces';

export interface ElevenLabsVoiceEligibility {
  availability: ElevenLabsVoiceAvailability;
  restriction: string | null;
}

/** Only `available` voices may be saved or used for speech. */
export function elevenLabsVoiceEligibility(
  voice: Pick<
    ElevenLabs.Voice,
    'category' | 'fineTuning' | 'safetyControl' | 'voiceVerification'
  >,
): ElevenLabsVoiceEligibility {
  if (
    voice.safetyControl === 'BAN' ||
    voice.safetyControl === 'ENTERPRISE_BAN'
  ) {
    return {
      availability: 'unavailable',
      restriction: 'ElevenLabs has blocked this voice.',
    };
  }

  if (
    voice.category === 'professional' &&
    !Object.values(voice.fineTuning?.state ?? {}).includes('fine_tuned')
  ) {
    return {
      availability: 'unavailable',
      restriction:
        'This professional clone has not finished training in ElevenLabs.',
    };
  }

  if (
    voice.voiceVerification?.requiresVerification &&
    !voice.voiceVerification.isVerified
  ) {
    return {
      availability: 'restricted',
      restriction: 'Verify this voice in ElevenLabs before using it.',
    };
  }

  if (
    voice.safetyControl === 'CAPTCHA' ||
    voice.safetyControl === 'ENTERPRISE_CAPTCHA'
  ) {
    return {
      availability: 'restricted',
      restriction: 'ElevenLabs requires an extra safety check for this voice.',
    };
  }

  return { availability: 'available', restriction: null };
}

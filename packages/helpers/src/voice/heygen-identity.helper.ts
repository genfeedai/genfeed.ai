import { VoiceProvider } from '@genfeedai/contracts';
import type {
  HeyGenAvatarRef,
  HeyGenCatalogVoice,
} from '@genfeedai/contracts/interfaces';
import type { DefaultVoiceRef } from './default-voice-ref.helper';

export function heyGenAvatarValue(
  ref: Pick<HeyGenAvatarRef, 'ownership' | 'lookId'>,
): string {
  return `heygen:${ref.ownership}:${ref.lookId}`;
}

export function heyGenVoiceValue(
  voice: Pick<HeyGenCatalogVoice, 'ownership' | 'voiceId'>,
): string {
  return `heygen:${voice.ownership}:${voice.voiceId}`;
}

export function heyGenDefaultVoice(voice: HeyGenCatalogVoice): DefaultVoiceRef {
  return {
    source: 'catalog',
    provider: VoiceProvider.HEYGEN,
    externalVoiceId: voice.voiceId,
    label: voice.name,
    preview: voice.preview || null,
    ownership: voice.ownership,
    connection: voice.connection,
  };
}

import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Kling Avatar V2 takes its driving audio as a separate `audio` input. The
 * generation brief only carries images and text, so a compiled dispatch has to
 * pick the audio up from the request before it is sent to the provider.
 */
export function attachAvatarAudioToCompiledDispatch(
  model: string,
  promptParams: Record<string, unknown>,
  audioUrl?: string,
): void {
  if (model !== MODEL_KEYS.REPLICATE_KWAIVGI_KLING_AVATAR_V2) return;
  if (!audioUrl) {
    throw new HttpException(
      {
        detail:
          'Audio file is required for Kling Avatar V2. Please provide an audio URL.',
        title: 'Avatar audio missing',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
  promptParams.audio = audioUrl;
}

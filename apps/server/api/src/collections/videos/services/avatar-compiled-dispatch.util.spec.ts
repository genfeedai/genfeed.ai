import { attachAvatarAudioToCompiledDispatch } from '@api/collections/videos/services/avatar-compiled-dispatch.util';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('attachAvatarAudioToCompiledDispatch', () => {
  it('adds the audio input for Kling Avatar V2', () => {
    const dispatch: Record<string, unknown> = { image: 'https://i/p.png' };

    attachAvatarAudioToCompiledDispatch(
      MODEL_KEYS.REPLICATE_KWAIVGI_KLING_AVATAR_V2,
      dispatch,
      'https://a/voice.mp3',
    );

    expect(dispatch).toEqual({
      audio: 'https://a/voice.mp3',
      image: 'https://i/p.png',
    });
  });

  it('rejects an avatar request without audio', () => {
    expect(() =>
      attachAvatarAudioToCompiledDispatch(
        MODEL_KEYS.REPLICATE_KWAIVGI_KLING_AVATAR_V2,
        {},
        undefined,
      ),
    ).toThrow(HttpException);
  });

  it('leaves other models untouched', () => {
    const dispatch: Record<string, unknown> = { start_image: 'x' };

    attachAvatarAudioToCompiledDispatch(
      MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_6,
      dispatch,
      'https://a/voice.mp3',
    );

    expect(dispatch).toEqual({ start_image: 'x' });
  });
});

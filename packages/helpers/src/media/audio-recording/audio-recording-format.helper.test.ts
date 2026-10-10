import {
  describeRecordedAudio,
  pickAudioRecordingFormat,
} from '@genfeedai/helpers/media/audio-recording/audio-recording-format.helper';
import { describe, expect, it } from 'vitest';

describe('pickAudioRecordingFormat', () => {
  it('prefers WebM/Opus when the browser records it', () => {
    expect(pickAudioRecordingFormat(() => true)?.recorderMimeType).toBe(
      'audio/webm;codecs=opus',
    );
  });

  it('falls back to MP4 on Safari, which cannot record WebM', () => {
    const format = pickAudioRecordingFormat(
      (mimeType) => mimeType === 'audio/mp4',
    );

    expect(format).toMatchObject({ blobType: 'audio/mp4', extension: 'm4a' });
  });

  it('returns undefined when nothing is supported', () => {
    expect(pickAudioRecordingFormat(() => false)).toBeUndefined();
  });
});

describe('describeRecordedAudio', () => {
  it('strips codec parameters and maps the extension', () => {
    expect(describeRecordedAudio('audio/mp4;codecs=mp4a.40.2')).toEqual({
      blobType: 'audio/mp4',
      extension: 'm4a',
    });
    expect(describeRecordedAudio('audio/ogg; codecs=opus')).toEqual({
      blobType: 'audio/ogg',
      extension: 'ogg',
    });
  });

  it('defaults to WebM when the recorder reports nothing usable', () => {
    expect(describeRecordedAudio(undefined)).toEqual({
      blobType: 'audio/webm',
      extension: 'webm',
    });
    expect(describeRecordedAudio('video/x-unknown')).toEqual({
      blobType: 'audio/webm',
      extension: 'webm',
    });
  });
});

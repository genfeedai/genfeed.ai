import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_AUDIO_TYPES,
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_VIDEO_TYPES,
  MAX_FILE_SIZE,
} from './upload.constant';

describe('upload.constant', () => {
  it('MAX_FILE_SIZE is 100MB', () => {
    expect(MAX_FILE_SIZE).toBe(100 * 1024 * 1024);
  });

  it('ACCEPTED_IMAGE_TYPES contains common image formats', () => {
    expect(ACCEPTED_IMAGE_TYPES).toContain('image/jpeg');
    expect(ACCEPTED_IMAGE_TYPES).toContain('image/png');
    expect(ACCEPTED_IMAGE_TYPES).toContain('image/gif');
    expect(ACCEPTED_IMAGE_TYPES).toContain('image/webp');
  });

  it('ACCEPTED_VIDEO_TYPES contains common video formats', () => {
    expect(ACCEPTED_VIDEO_TYPES).toContain('video/mp4');
    expect(ACCEPTED_VIDEO_TYPES).toContain('video/webm');
  });

  it('ACCEPTED_AUDIO_TYPES contains common audio formats', () => {
    expect(ACCEPTED_AUDIO_TYPES).toContain('audio/mpeg');
    expect(ACCEPTED_AUDIO_TYPES).toContain('audio/wav');
    expect(ACCEPTED_AUDIO_TYPES).toContain('audio/mp3');
  });
});

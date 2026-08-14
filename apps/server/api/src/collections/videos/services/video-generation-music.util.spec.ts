import {
  resolveBackgroundMusicDuration,
  resolveBackgroundMusicVolume,
  shouldStartBackgroundMusic,
} from './video-generation-music.util';

describe('video background music helpers', () => {
  it('starts orchestration only when a music source is present', () => {
    expect(shouldStartBackgroundMusic(undefined)).toBe(false);
    expect(shouldStartBackgroundMusic('track-1')).toBe(true);
  });

  it('applies the shipped volume and duration defaults', () => {
    expect(resolveBackgroundMusicVolume()).toBe(30);
    expect(resolveBackgroundMusicVolume(12)).toBe(12);
    expect(resolveBackgroundMusicDuration()).toBe(10);
    expect(resolveBackgroundMusicDuration(8)).toBe(8);
  });
});

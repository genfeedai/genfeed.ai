export function shouldStartBackgroundMusic(backgroundMusic?: unknown): boolean {
  return Boolean(backgroundMusic);
}

export function resolveBackgroundMusicVolume(musicVolume?: number): number {
  return musicVolume ?? 30;
}

export function resolveBackgroundMusicDuration(duration?: number): number {
  return duration || 10;
}

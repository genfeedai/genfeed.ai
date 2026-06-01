function getFrameTimeParts(frames: number, fps: number) {
  const totalSeconds = frames / fps;

  return {
    minutes: Math.floor(totalSeconds / 60),
    seconds: Math.floor(totalSeconds % 60),
    totalSeconds,
  };
}

function padTimePart(value: number, length: number): string {
  return value.toString().padStart(length, '0');
}

export function formatTimelineFrameTime(frames: number, fps: number): string {
  const { minutes, seconds } = getFrameTimeParts(frames, fps);
  const frameNum = Math.floor(frames % fps);

  return `${padTimePart(minutes, 2)}:${padTimePart(seconds, 2)}:${padTimePart(frameNum, 2)}`;
}

export function formatPlaybackFrameTime(frames: number, fps: number): string {
  const { minutes, seconds, totalSeconds } = getFrameTimeParts(frames, fps);
  const centiseconds = Math.floor((totalSeconds % 1) * 100);

  return `${padTimePart(minutes, 2)}:${padTimePart(seconds, 2)}.${padTimePart(centiseconds, 2)}`;
}

export function formatPreciseFrameTime(frames: number, fps: number): string {
  const { minutes, seconds, totalSeconds } = getFrameTimeParts(frames, fps);
  const ms = Math.round((totalSeconds % 1) * 1000);

  return `${padTimePart(minutes, 2)}:${padTimePart(seconds, 2)}.${padTimePart(ms, 3)}`;
}

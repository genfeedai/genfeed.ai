export interface AudioOverlayArgsOptions {
  audioPath: string;
  audioVolume: number;
  fadeIn: number;
  fadeOut: number;
  mixMode: 'replace' | 'mix' | 'background';
  outputPath: string;
  videoPath: string;
  videoVolume: number;
  durationSeconds: number;
  hasVideoAudio: boolean;
}

export function buildAudioOverlayArgs(
  options: AudioOverlayArgsOptions,
): string[] {
  const {
    audioPath,
    audioVolume,
    fadeIn,
    fadeOut,
    mixMode,
    outputPath,
    videoPath,
    videoVolume,
    durationSeconds,
    hasVideoAudio,
  } = options;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error('Video duration must be positive');
  }
  let added = `[1:a]volume=${audioVolume * (mixMode === 'background' ? 0.3 : 1)},apad,atrim=duration=${durationSeconds},asetpts=PTS-STARTPTS`;
  if (fadeIn > 0)
    added += `,afade=t=in:st=0:d=${Math.min(fadeIn, durationSeconds)}`;
  if (fadeOut > 0)
    added += `,afade=t=out:st=${Math.max(0, durationSeconds - fadeOut)}:d=${Math.min(fadeOut, durationSeconds)}`;
  const filter =
    mixMode === 'replace' || !hasVideoAudio
      ? `${added},alimiter=limit=0.707:level=false:latency=true[aout]`
      : `[0:a]volume=${videoVolume},apad,atrim=duration=${durationSeconds},asetpts=PTS-STARTPTS[va];${added}[aa];[va][aa]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.707:level=false:latency=true[aout]`;
  return [
    '-i',
    videoPath,
    '-i',
    audioPath,
    '-filter_complex',
    filter,
    '-map',
    '0:v:0',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-t',
    String(durationSeconds),
    '-y',
    outputPath,
  ];
}

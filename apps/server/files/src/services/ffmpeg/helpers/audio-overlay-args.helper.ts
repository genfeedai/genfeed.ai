export interface AudioOverlayArgsOptions {
  audioPath: string;
  audioVolume: number;
  fadeIn: number;
  fadeOut: number;
  mixMode: 'replace' | 'mix' | 'background';
  outputPath: string;
  videoPath: string;
  videoVolume: number;
}

function appendFades(base: string, fadeIn: number, fadeOut: number): string {
  let filter = base;
  if (fadeIn > 0) {
    filter += `,afade=t=in:st=0:d=${fadeIn}`;
  }
  if (fadeOut > 0) {
    filter += `,afade=t=out:st=-${fadeOut}:d=${fadeOut}`;
  }
  return filter;
}

function outputArgs(filter: string, outputPath: string): string[] {
  return [
    '-filter_complex',
    filter,
    '-map',
    '0:v',
    '-map',
    '[aout]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-shortest',
    '-y',
    outputPath,
  ];
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
  } = options;
  const args = ['-i', videoPath, '-i', audioPath];

  if (mixMode === 'replace') {
    const filter = `${appendFades(
      `[1:a]volume=${audioVolume}`,
      fadeIn,
      fadeOut,
    )}[aout]`;
    return [...args, ...outputArgs(filter, outputPath)];
  }

  if (mixMode === 'mix') {
    const addedAudio = appendFades(
      `[1:a]volume=${audioVolume}`,
      fadeIn,
      fadeOut,
    );
    const filter = `[0:a]volume=${videoVolume}[va];${addedAudio}[aa];[va][aa]amix=inputs=2:duration=first:dropout_transition=0[aout]`;
    return [...args, ...outputArgs(filter, outputPath)];
  }

  const backgroundAudio = appendFades(
    `[1:a]volume=${audioVolume * 0.3}`,
    fadeIn,
    fadeOut,
  );
  const filter = `[0:a]volume=${videoVolume}[va];${backgroundAudio}[bg];[va][bg]amix=inputs=2:duration=first:dropout_transition=0[aout]`;
  return [...args, ...outputArgs(filter, outputPath)];
}

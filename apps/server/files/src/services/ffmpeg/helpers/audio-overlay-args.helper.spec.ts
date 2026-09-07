import { buildAudioOverlayArgs } from '@files/services/ffmpeg/helpers/audio-overlay-args.helper';

const baseOptions = {
  durationSeconds: 30,
  hasVideoAudio: true,
  audioPath: '/tmp/audio.mp3',
  audioVolume: 0.8,
  fadeIn: 0,
  fadeOut: 0,
  outputPath: '/tmp/output.mp4',
  videoPath: '/tmp/video.mp4',
  videoVolume: 0.6,
} as const;

function filterFrom(args: string[]): string {
  return args[args.indexOf('-filter_complex') + 1];
}

describe('buildAudioOverlayArgs', () => {
  it('maps replacement audio and preserves the video stream', () => {
    const args = buildAudioOverlayArgs({
      ...baseOptions,
      mixMode: 'replace',
    });

    expect(filterFrom(args)).toContain(
      '[1:a]volume=0.8,apad,atrim=duration=30',
    );
    expect(args).not.toContain('-shortest');
    expect(args[args.indexOf('-t') + 1]).toBe('30');
    expect(args).toContain('copy');
    expect(args.at(-1)).toBe('/tmp/output.mp4');
  });

  it('mixes both tracks and applies fades to the added audio', () => {
    const args = buildAudioOverlayArgs({
      ...baseOptions,
      fadeIn: 2,
      fadeOut: 3,
      mixMode: 'mix',
    });
    const filter = filterFrom(args);

    expect(filter).toContain('[0:a]volume=0.6,apad');
    expect(filter).toContain('afade=t=in:st=0:d=2');
    expect(filter).toContain('afade=t=out:st=27:d=3');
    expect(filter).toContain('amix=inputs=2');
  });

  it('supports videos without an original audio stream', () => {
    const args = buildAudioOverlayArgs({
      ...baseOptions,
      hasVideoAudio: false,
      mixMode: 'mix',
    });
    expect(filterFrom(args)).not.toContain('[0:a]');
    expect(filterFrom(args)).toContain('[aout]');
  });

  it('ducks background audio to thirty percent of its requested volume', () => {
    const args = buildAudioOverlayArgs({
      ...baseOptions,
      mixMode: 'background',
    });

    expect(filterFrom(args)).toContain('[1:a]volume=0.24,apad');
  });
});

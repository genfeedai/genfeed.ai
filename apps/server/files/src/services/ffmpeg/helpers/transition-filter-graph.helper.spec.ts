import {
  buildTransitionFilterGraph,
  isXfadeTransition,
} from '@files/services/ffmpeg/helpers/transition-filter-graph.helper';
import type { TransitionFilterGraphOptions } from '@files/shared/interfaces/ffmpeg.interfaces';
import { VideoTransition } from '@genfeedai/contracts';

const TRANSITIONS = Object.values(VideoTransition).filter(
  (transition) => transition !== VideoTransition.NONE,
);

function options(
  overrides: Partial<TransitionFilterGraphOptions> = {},
): TransitionFilterGraphOptions {
  return {
    clips: [
      { duration: 5, hasAudio: true },
      { duration: 3, hasAudio: false },
      { duration: 4.2, hasAudio: true },
    ],
    height: 1920,
    isAudioIncluded: true,
    transition: VideoTransition.FADE,
    transitionDuration: 0.5,
    width: 1080,
    ...overrides,
  };
}

describe('buildTransitionFilterGraph', () => {
  it('offers exactly the ten xfade transitions of VideoTransition', () => {
    expect(TRANSITIONS).toHaveLength(10);
    for (const transition of TRANSITIONS) {
      expect(isXfadeTransition(transition)).toBe(true);
    }
    expect(isXfadeTransition(VideoTransition.NONE)).toBe(false);
    expect(isXfadeTransition('cut')).toBe(false);
  });

  it.each(TRANSITIONS)(
    'chains %s with offsets from the cumulative video length',
    (transition) => {
      const graph = buildTransitionFilterGraph(options({ transition }));
      const filters = graph.filterComplex.split(';');

      expect(filters).toContain(
        `[v0][v1]xfade=transition=${transition}:duration=0.5:offset=4.5[xv1]`,
      );
      // 5 + 3 − 0.5 joined so far, minus the next overlap.
      expect(filters).toContain(
        `[xv1][v2]xfade=transition=${transition}:duration=0.5:offset=7[xv2]`,
      );
      expect(filters).toContain('[xv2]format=yuv420p[vout]');
      expect(graph.outputDuration).toBeCloseTo(5 + 3 + 4.2 - 2 * 0.5, 6);
    },
  );

  it.each([0.1, 0.5, 2])(
    'keeps a %ss overlap in both the picture and the audio',
    (duration) => {
      const graph = buildTransitionFilterGraph(
        options({ transitionDuration: duration }),
      );
      expect(graph.filterComplex).toContain(
        `[v0][v1]xfade=transition=fade:duration=${duration}:offset=${5 - duration}[xv1]`,
      );
      expect(graph.filterComplex).toContain(
        `[a0][a1]acrossfade=d=${duration}:c1=tri:c2=tri[xa1]`,
      );
      expect(graph.filterComplex).toContain(
        `[xa1][a2]acrossfade=d=${duration}:c1=tri:c2=tri[aout]`,
      );
    },
  );

  it('normalizes every clip to one size, rate and time base before xfade', () => {
    const { filterComplex } = buildTransitionFilterGraph(options());
    for (const index of [0, 1, 2]) {
      // setpts must precede fps: FFmpeg 7 unsets the frame rate after setpts
      // and xfade refuses an input without a constant frame rate.
      expect(filterComplex).toContain(
        `[${index}:v]setpts=PTS-STARTPTS,fps=30,scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${index}]`,
      );
    }
  });

  it('fits each clip audio to its video length and fills silent clips', () => {
    const { audioLabel, filterComplex } = buildTransitionFilterGraph(options());
    const filters = filterComplex.split(';');

    expect(audioLabel).toBe('[aout]');
    expect(filters).toContain(
      '[0:a]asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,apad=whole_dur=5,atrim=duration=5[a0]',
    );
    expect(filters).toContain(
      'anullsrc=channel_layout=stereo:sample_rate=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,apad=whole_dur=3,atrim=duration=3[a1]',
    );
    expect(filterComplex).not.toContain('[1:a]');
  });

  it('builds a video-only graph when audio is excluded', () => {
    const graph = buildTransitionFilterGraph(
      options({ isAudioIncluded: false }),
    );
    expect(graph.audioLabel).toBeUndefined();
    expect(graph.videoLabel).toBe('[vout]');
    expect(graph.filterComplex).not.toContain('acrossfade');
    expect(graph.filterComplex).not.toContain(':a]');
  });

  it.each([
    VideoTransition.NONE,
    'cut',
    'fade:offset=0[x];[0:v]drawtext',
    'circlecrop',
  ])('rejects the unsupported transition %s', (transition) => {
    expect(() => buildTransitionFilterGraph(options({ transition }))).toThrow(
      'Unsupported video transition',
    );
  });

  it.each([0, -1, Number.NaN])(
    'rejects a transition duration of %s',
    (transitionDuration) => {
      expect(() =>
        buildTransitionFilterGraph(options({ transitionDuration })),
      ).toThrow('Transition duration must be a positive number of seconds');
    },
  );

  it('rejects a transition that is not shorter than every clip', () => {
    expect(() =>
      buildTransitionFilterGraph(options({ transitionDuration: 3 })),
    ).toThrow(
      'Transition duration 3s must be shorter than every clip; clip 2 is 3s',
    );
  });

  it('rejects fewer than two clips and unplayable clips', () => {
    expect(() =>
      buildTransitionFilterGraph(
        options({ clips: [{ duration: 5, hasAudio: true }] }),
      ),
    ).toThrow('A transition merge needs at least two clips');
    expect(() =>
      buildTransitionFilterGraph(
        options({
          clips: [
            { duration: 5, hasAudio: true },
            { duration: Number.NaN, hasAudio: true },
          ],
        }),
      ),
    ).toThrow('Clip 2 has no playable duration');
  });

  it('rejects an odd output size', () => {
    expect(() => buildTransitionFilterGraph(options({ width: 1079 }))).toThrow(
      'Transition output size must be even and positive',
    );
  });
});

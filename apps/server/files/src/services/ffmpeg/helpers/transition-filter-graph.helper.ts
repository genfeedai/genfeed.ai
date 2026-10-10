import type {
  TransitionFilterGraph,
  TransitionFilterGraphOptions,
} from '@files/shared/interfaces/ffmpeg.interfaces';
import { VideoTransition } from '@genfeedai/contracts';

/** Every clip is resampled to one constant rate before `xfade`. */
export const TRANSITION_FRAME_RATE = 30;
const AUDIO_SAMPLE_RATE = 48_000;

const XFADE_TRANSITIONS: ReadonlySet<string> = new Set(
  Object.values(VideoTransition).filter(
    (transition) => transition !== VideoTransition.NONE,
  ),
);

/** Whether `transition` is one of the `xfade` transitions a merge offers. */
export function isXfadeTransition(transition: string): boolean {
  return XFADE_TRANSITIONS.has(transition);
}

/** Seconds as a filter argument: millisecond precision, no exponent form. */
function seconds(value: number): string {
  return String(Number(value.toFixed(3)));
}

/**
 * Builds the `-filter_complex` graph that joins clips with `xfade` video
 * transitions and `acrossfade` audio transitions.
 *
 * `xfade` needs both inputs at the same size, frame rate and time base, and it
 * only advances to the next clip at `offset`, so every offset comes from the
 * clips' video durations (a longer audio track must not push it past the end
 * of the video). Each clip is normalized first: timestamps restart at zero
 * *before* the frame-rate conversion, because FFmpeg 7 drops the frame rate
 * after `setpts` and `xfade` then refuses the input. Each clip's audio is
 * padded or trimmed to its video duration so the crossfaded audio stays in
 * sync with the picture; clips without audio contribute silence.
 */
export function buildTransitionFilterGraph(
  options: TransitionFilterGraphOptions,
): TransitionFilterGraph {
  const {
    clips,
    height,
    isAudioIncluded,
    transition,
    transitionDuration,
    width,
  } = options;

  if (clips.length < 2) {
    throw new Error('A transition merge needs at least two clips');
  }
  if (!isXfadeTransition(transition)) {
    throw new Error(`Unsupported video transition "${transition}"`);
  }
  if (!Number.isFinite(transitionDuration) || transitionDuration <= 0) {
    throw new Error('Transition duration must be a positive number of seconds');
  }
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 2 ||
    height < 2 ||
    width % 2 !== 0 ||
    height % 2 !== 0
  ) {
    throw new Error('Transition output size must be even and positive');
  }
  for (const [index, clip] of clips.entries()) {
    if (!Number.isFinite(clip.duration) || clip.duration <= 0) {
      throw new Error(`Clip ${index + 1} has no playable duration`);
    }
    if (clip.duration <= transitionDuration) {
      throw new Error(
        `Transition duration ${seconds(transitionDuration)}s must be shorter than every clip; clip ${index + 1} is ${seconds(clip.duration)}s`,
      );
    }
  }

  const filters: string[] = clips.map(
    (_, index) =>
      `[${index}:v]setpts=PTS-STARTPTS,fps=${TRANSITION_FRAME_RATE},` +
      `scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${index}]`,
  );

  // Transition k starts where the joined video so far ends, minus the overlap.
  let joinedDuration = clips[0].duration;
  let previousVideo = '[v0]';
  for (let index = 1; index < clips.length; index++) {
    const offset = joinedDuration - transitionDuration;
    const output = `[xv${index}]`;
    filters.push(
      `${previousVideo}[v${index}]xfade=transition=${transition}:duration=${seconds(transitionDuration)}:offset=${seconds(offset)}${output}`,
    );
    joinedDuration = offset + clips[index].duration;
    previousVideo = output;
  }
  // `xfade` works in 4:4:4; deliver the 4:2:0 every player can decode.
  filters.push(`${previousVideo}format=yuv420p[vout]`);

  if (!isAudioIncluded) {
    return {
      filterComplex: filters.join(';'),
      outputDuration: joinedDuration,
      videoLabel: '[vout]',
    };
  }

  for (const [index, clip] of clips.entries()) {
    const duration = seconds(clip.duration);
    const source = clip.hasAudio
      ? `[${index}:a]asetpts=PTS-STARTPTS,aresample=${AUDIO_SAMPLE_RATE},`
      : `anullsrc=channel_layout=stereo:sample_rate=${AUDIO_SAMPLE_RATE},`;
    filters.push(
      `${source}aformat=sample_fmts=fltp:sample_rates=${AUDIO_SAMPLE_RATE}:channel_layouts=stereo,` +
        `apad=whole_dur=${duration},atrim=duration=${duration}[a${index}]`,
    );
  }
  let previousAudio = '[a0]';
  for (let index = 1; index < clips.length; index++) {
    const output = index === clips.length - 1 ? '[aout]' : `[xa${index}]`;
    filters.push(
      `${previousAudio}[a${index}]acrossfade=d=${seconds(transitionDuration)}:c1=tri:c2=tri${output}`,
    );
    previousAudio = output;
  }

  return {
    audioLabel: '[aout]',
    filterComplex: filters.join(';'),
    outputDuration: joinedDuration,
    videoLabel: '[vout]',
  };
}

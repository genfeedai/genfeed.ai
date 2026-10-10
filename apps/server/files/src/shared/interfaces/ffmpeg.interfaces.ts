export interface FFmpegProgress {
  frames: number;
  fps: number;
  q: number;
  size: string;
  time: string;
  bitrate: string;
  speed: string;
  percent?: number; // Optional, can be calculated from time/duration
}

export interface FFprobeStream {
  index: number;
  codec_name: string;
  codec_long_name: string;
  codec_type: 'video' | 'audio' | 'subtitle' | 'data';
  width?: number;
  height?: number;
  tags?: { rotate?: string };
  side_data_list?: Array<{ rotation?: number }>;
  duration?: string;
  bit_rate?: string;
}

export interface FFprobeData {
  streams: FFprobeStream[];
  format: {
    filename: string;
    format_name?: string;
    duration: string;
    size: string;
    bit_rate: string;
  };
}

/** One probed clip of a transition merge, in playback order. */
export interface TransitionMergeClip {
  /** Seconds of video the clip contributes; its audio is fitted to it. */
  duration: number;
  hasAudio: boolean;
}

export interface TransitionFilterGraphOptions {
  clips: TransitionMergeClip[];
  /** Crossfade clip audio (silence for clips without audio) into the output. */
  isAudioIncluded: boolean;
  transition: string;
  transitionDuration: number;
  width: number;
  height: number;
}

export interface TransitionFilterGraph {
  filterComplex: string;
  videoLabel: string;
  /** Present when the graph produces an audio output. */
  audioLabel?: string;
  /** Seconds: every clip's duration minus each transition overlap. */
  outputDuration: number;
}

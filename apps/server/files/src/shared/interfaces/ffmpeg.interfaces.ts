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
  duration?: string;
  bit_rate?: string;
}

export interface FFprobeData {
  streams: FFprobeStream[];
  format: {
    filename: string;
    duration: string;
    size: string;
    bit_rate: string;
  };
}

/**
 * Files processing interfaces
 * Used by FilesClientService and related file processing services
 */

import type { FileInputType } from '@genfeedai/enums';

export type UploadSource =
  | { type: FileInputType.FILE; path: string }
  | { type: FileInputType.URL; url: string }
  | { type: FileInputType.BASE64; data: string; contentType: string }
  | { type: FileInputType.BUFFER; data: Buffer; contentType: string };

export interface IApiUploadSource {
  type: FileInputType;
  path?: string;
  url?: string;
  data?: string;
  contentType?: string;
}

export interface ICaptionConfig {
  words: ICaptionWord[];
  style?: ICaptionStyle;
}

export interface ICaptionWord {
  text: string;
  start: number;
  end: number;
}

export interface ICaptionStyle {
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  backgroundColor?: string;
  position?: 'top' | 'center' | 'bottom';
}

export interface IGifOptions {
  fps?: number;
  width?: number;
  startTime?: number;
  duration?: number;
}

export interface IImageToVideoConfig {
  fps?: number;
  duration?: number;
  transition?: string;
  transitionDuration?: number;
}

export interface IImageInput {
  url: string;
  duration?: number;
  order?: number;
}

export interface IKenBurnsOptions {
  zoomStart?: number;
  zoomEnd?: number;
  panX?: number;
  panY?: number;
}

export interface IPortraitBlurOptions {
  blurAmount?: number;
  backgroundColor?: string;
}

export interface ISplitScreenOptions {
  layout?: 'horizontal' | 'vertical' | 'grid';
  gap?: number;
}

export interface ISplitScreenVideo {
  url: string;
  position?: number;
}

export interface IVideoDimensions {
  width: number;
  height: number;
}

export interface IDownloadHeaders {
  [key: string]: string;
}

export interface IFFprobeStream {
  codec_type: 'video' | 'audio' | 'subtitle' | 'data';
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  bit_rate?: string;
  [key: string]: unknown;
}

export interface IFileMetadata {
  width?: number;
  height?: number;
  duration?: number;
  size?: number;
  hasAudio?: boolean;
  publicUrl?: string;
  [key: string]: unknown;
}

export interface IPresignedUploadResult {
  uploadUrl: string;
  publicUrl: string;
  s3Key: string;
}

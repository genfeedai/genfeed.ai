import fs from 'node:fs';
import path from 'node:path';
import type { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { buildCaptionBurnFilterScript } from '@files/services/files/captions/caption-burn.util';
import type { FFmpegProgress } from '@files/shared/interfaces/ffmpeg.interfaces';
import type { VideoJobData } from '@files/shared/interfaces/job.interface';

export interface RenderCaptionsOptions {
  inputPath: string;
  onProgress: (progress: FFmpegProgress) => void;
  outputPath: string;
  params: VideoJobData['params'];
  tempPath: string;
}

/** The picture size as players show it, after any rotation tag. */
async function readDisplaySize(
  ffmpeg: FFmpegService,
  videoPath: string,
): Promise<{ height: number; width: number }> {
  const metadata = await ffmpeg.getVideoMetadata(videoPath);
  const video = metadata.streams?.find(
    (stream) => stream.codec_type === 'video',
  );
  const width = video?.width ?? 0;
  const height = video?.height ?? 0;
  const rotation = Number(
    video?.tags?.rotate ??
      video?.side_data_list?.find((data) => 'rotation' in data)?.rotation ??
      0,
  );
  return Math.abs(rotation) % 180 === 90
    ? { height: width, width: height }
    : { height, width };
}

/**
 * Burns the captions into the picture when the job carries a caption style and
 * the SRT has usable cues; otherwise muxes them as a soft subtitle track.
 */
export async function renderCaptions(
  ffmpeg: FFmpegService,
  options: RenderCaptionsOptions,
): Promise<void> {
  const { inputPath, params } = options;
  const captionsPath = path.join(options.tempPath, 'captions.srt');
  const isMuted = params.isMuteVideoAudio === true;
  const hasCaptions = Boolean(params.captionContent?.trim());
  if (hasCaptions || !isMuted) {
    fs.writeFileSync(captionsPath, params.captionContent || '');
  }
  const muteOptions = isMuted ? { muteVideoAudio: true } : undefined;

  if (hasCaptions && params.captionStyle) {
    const { height, width } = await readDisplaySize(ffmpeg, inputPath);
    const burn =
      width >= 16 && height >= 16
        ? buildCaptionBurnFilterScript({
            height,
            srt: params.captionContent ?? '',
            style: params.captionStyle,
            width,
          })
        : null;
    if (burn) {
      const filterScriptPath = path.join(options.tempPath, 'captions.filter');
      fs.writeFileSync(filterScriptPath, burn.script);
      await ffmpeg.burnCaptions(
        inputPath,
        options.outputPath,
        filterScriptPath,
        options.onProgress,
        muteOptions,
      );
      return;
    }
  }

  await ffmpeg.addCaptions(
    inputPath,
    options.outputPath,
    hasCaptions || !isMuted ? captionsPath : undefined,
    options.onProgress,
    muteOptions,
  );
}

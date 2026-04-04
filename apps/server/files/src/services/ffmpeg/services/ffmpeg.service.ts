import { FFmpegCoreService } from '@files/services/ffmpeg/services/ffmpeg-core.service';
import { FFmpegEffectsService } from '@files/services/ffmpeg/services/ffmpeg-effects.service';
import { FFmpegMergeService } from '@files/services/ffmpeg/services/ffmpeg-merge.service';
import { FFmpegTransformService } from '@files/services/ffmpeg/services/ffmpeg-transform.service';
import {
  FFmpegProgress,
  FFprobeData,
} from '@files/shared/interfaces/ffmpeg.interfaces';
import { VideoEaseCurve } from '@genfeedai/enums';
import { Injectable } from '@nestjs/common';

/**
 * FFmpegService - Facade for all FFmpeg operations.
 *
 * Delegates to specialized services:
 * - FFmpegCoreService: Binary execution, probing, temp files
 * - FFmpegTransformService: Resize, scale, trim, compress, convert
 * - FFmpegMergeService: Concatenation, merging, transitions
 * - FFmpegEffectsService: Ken Burns, split screens, overlays
 */
@Injectable()
export class FFmpegService {
  constructor(
    private readonly core: FFmpegCoreService,
    private readonly transform: FFmpegTransformService,
    private readonly merge: FFmpegMergeService,
    private readonly effects: FFmpegEffectsService,
  ) {}

  // ============================================================
  // Core Operations (delegated to FFmpegCoreService)
  // ============================================================

  async probe(inputPath: string): Promise<FFprobeData> {
    return this.core.probe(inputPath);
  }

  async hasAudioStream(inputPath: string): Promise<boolean> {
    return this.core.hasAudioStream(inputPath);
  }

  async getVideoMetadata(videoPath: string): Promise<FFprobeData> {
    return this.core.getVideoMetadata(videoPath);
  }

  getTempPath(type: string, ingredientId?: string): string {
    return this.core.getTempPath(type, ingredientId);
  }

  async cleanupTempFiles(...filePaths: string[]): Promise<void> {
    return this.core.cleanupTempFiles(...filePaths);
  }

  // ============================================================
  // Transform Operations (delegated to FFmpegTransformService)
  // ============================================================

  async resizeVideo(
    inputPath: string,
    outputPath: string,
    width: number,
    height: number,
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    return this.transform.resizeVideo(
      inputPath,
      outputPath,
      width,
      height,
      onProgress,
    );
  }

  async scaleVideo(
    inputPath: string,
    outputPath: string,
    dimensions: { width: number; height: number },
    options?: {
      videoCodec?: string;
      preset?: string;
      crf?: string;
      pixelFormat?: string;
    },
  ): Promise<void> {
    return this.transform.scaleVideo(
      inputPath,
      outputPath,
      dimensions,
      options,
    );
  }

  async trimVideo(
    inputPath: string,
    outputPath: string,
    startTime: number,
    duration: number,
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    return this.transform.trimVideo(
      inputPath,
      outputPath,
      startTime,
      duration,
      onProgress,
    );
  }

  async compressVideo(
    inputPath: string,
    outputPath: string,
    options?: {
      crf?: number;
      preset?: string;
      videoBitrate?: string;
      audioBitrate?: string;
    },
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<string> {
    return this.transform.compressVideo(
      inputPath,
      outputPath,
      options,
      onProgress,
    );
  }

  async convertToPortrait(
    inputPath: string,
    outputPath: string,
    dimensions?: { width: number; height: number },
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    return this.transform.convertToPortrait(
      inputPath,
      outputPath,
      dimensions,
      onProgress,
    );
  }

  async reverseVideo(
    inputPath: string,
    outputPath: string,
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    return this.transform.reverseVideo(inputPath, outputPath, onProgress);
  }

  async mirrorVideo(
    inputPath: string,
    outputPath: string,
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    return this.transform.mirrorVideo(inputPath, outputPath, onProgress);
  }

  async applyPortraitBlur(
    inputPath: string,
    outputPath: string,
    blurAmount?: number,
  ): Promise<void> {
    return this.transform.applyPortraitBlur(inputPath, outputPath, blurAmount);
  }

  async createPortraitWithBlur(
    inputPath: string,
    outputPath: string,
    dimensions: { width: number; height: number },
  ): Promise<void> {
    return this.transform.createPortraitWithBlur(
      inputPath,
      outputPath,
      dimensions,
    );
  }

  async convertVideoToAudio(
    inputPath: string,
    outputPath: string,
    options?: {
      audioCodec?: string;
      audioBitrate?: string;
      format?: string;
    },
  ): Promise<void> {
    return this.transform.convertVideoToAudio(inputPath, outputPath, options);
  }

  async extractFrame(
    inputPath: string,
    outputPath: string,
    timeInSeconds: number,
  ): Promise<string> {
    return this.transform.extractFrame(inputPath, outputPath, timeInSeconds);
  }

  async convertToGif(
    inputPath: string,
    outputPath: string,
    options?: { width?: number; fps?: number },
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    return this.transform.convertToGif(
      inputPath,
      outputPath,
      options,
      onProgress,
    );
  }

  async videoToGif(
    inputPath: string,
    outputPath: string,
    options?: {
      width?: number;
      fps?: number;
      startTime?: string;
      duration?: string;
    },
  ): Promise<void> {
    return this.transform.videoToGif(inputPath, outputPath, options);
  }

  // ============================================================
  // Merge Operations (delegated to FFmpegMergeService)
  // ============================================================

  async concatenateVideos(
    inputPaths: string[],
    outputPath: string,
    options?: {
      videoCodec?: string;
      audioCodec?: string;
      includeAudio?: boolean;
    },
  ): Promise<void> {
    return this.merge.concatenateVideos(inputPaths, outputPath, options);
  }

  async mergeVideos(
    videoPaths: string[],
    outputPath: string,
    options?: { transition?: string },
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    return this.merge.mergeVideos(videoPaths, outputPath, options, onProgress);
  }

  async mergeVideosWithTransitions(
    videoPaths: string[],
    outputPath: string,
    options?: {
      transition?: string;
      transitionDuration?: number;
      transitionEaseCurve?: VideoEaseCurve;
    },
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    return this.merge.mergeVideosWithTransitions(
      videoPaths,
      outputPath,
      options,
      onProgress,
    );
  }

  async mergeVideosWithMusic(
    videoPaths: string[],
    outputPath: string,
    options?: {
      musicPath?: string;
      musicVolume?: number;
      muteVideoAudio?: boolean;
      videoCodec?: string;
      audioCodec?: string;
      preset?: string;
      crf?: string;
    },
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    return this.merge.mergeVideosWithMusic(
      videoPaths,
      outputPath,
      options,
      onProgress,
    );
  }

  // ============================================================
  // Effects Operations (delegated to FFmpegEffectsService)
  // ============================================================

  async imageToVideoWithKenBurns(
    inputPath: string,
    outputPath: string,
    options?: {
      duration?: number;
      fps?: number;
      width?: number;
      height?: number;
      zoom?: number;
    },
  ): Promise<void> {
    return this.effects.imageToVideoWithKenBurns(
      inputPath,
      outputPath,
      options,
    );
  }

  async generateKenBurnsSlide(
    inputPath: string,
    outputPath: string,
    options: {
      duration: number;
      zoomDirection: string;
      fps?: number;
      zoomFactor?: string;
      dimensions: { width: number; height: number };
    },
  ): Promise<void> {
    return this.effects.generateKenBurnsSlide(inputPath, outputPath, options);
  }

  async createKenBurnsVideoWithTransitions(
    slidePaths: string[],
    outputPath: string,
    options: {
      slideTexts: Array<{ duration: number }>;
      transitionDuration: number;
      fps: number;
      dimensions: { width: number; height: number };
      totalDuration: number;
      zoomEaseCurve?: VideoEaseCurve;
      zoomConfigs?: Array<{
        startZoom?: number;
        endZoom?: number;
        startX?: number;
        startY?: number;
        endX?: number;
        endY?: number;
      }>;
    },
  ): Promise<void> {
    return this.effects.createKenBurnsVideoWithTransitions(
      slidePaths,
      outputPath,
      options,
    );
  }

  async createSplitScreen(
    leftInputPath: string,
    rightInputPath: string,
    outputPath: string,
    options?: {
      width?: number;
      height?: number;
      audioFrom?: 'left' | 'right' | 'mix';
    },
  ): Promise<void> {
    return this.effects.createSplitScreen(
      leftInputPath,
      rightInputPath,
      outputPath,
      options,
    );
  }

  async createVerticalSplitScreen(
    topInputPath: string,
    bottomInputPath: string,
    outputPath: string,
    dimensions: { width: number; height: number },
  ): Promise<void> {
    return this.effects.createVerticalSplitScreen(
      topInputPath,
      bottomInputPath,
      outputPath,
      dimensions,
    );
  }

  async addTextOverlay(
    inputPath: string,
    outputPath: string,
    text: string,
    options?: {
      fontFile?: string;
      fontSize?: number;
      fontColor?: string;
      position?: string;
    },
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    return this.effects.addTextOverlay(
      inputPath,
      outputPath,
      text,
      options,
      onProgress,
    );
  }

  async addCaptions(
    inputPath: string,
    outputPath: string,
    captionsPath: string,
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    return this.effects.addCaptions(
      inputPath,
      outputPath,
      captionsPath,
      onProgress,
    );
  }

  async addAudioAndTextToVideo(
    inputPath: string,
    outputPath: string,
    options?: {
      audioPath?: string;
      filters?: string[];
      videoCodec?: string;
      audioCodec?: string;
      includeAudio?: boolean;
    },
  ): Promise<void> {
    return this.effects.addAudioAndTextToVideo(inputPath, outputPath, options);
  }

  async addComplexAudioMix(
    videoPath: string,
    outputPath: string,
    options: {
      musicPath: string;
      voicePaths: string[];
      slideTexts: Array<{ duration: number }>;
      filters: string[];
      musicVolume?: number;
    },
  ): Promise<void> {
    return this.effects.addComplexAudioMix(videoPath, outputPath, options);
  }

  async overlayAudio(
    videoPath: string,
    audioPath: string,
    outputPath: string,
    options?: {
      mixMode: 'replace' | 'mix' | 'background';
      audioVolume?: number;
      videoVolume?: number;
      fadeIn?: number;
      fadeOut?: number;
    },
    onProgress?: (progress: FFmpegProgress) => void,
  ): Promise<void> {
    return this.effects.overlayAudio(
      videoPath,
      audioPath,
      outputPath,
      options,
      onProgress,
    );
  }
}

import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { MixMode } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface SoundOverlayInput {
  videoUrl: string;
  soundUrl: string;
  mixMode: MixMode;
  audioVolume: number;
  videoVolume: number;
  fadeIn: number;
  fadeOut: number;
}

export interface SoundOverlayOutput {
  outputVideoUrl: string;
  duration: number;
}

/**
 * SoundOverlayProcessor
 *
 * Handles audio overlay operations for workflow nodes.
 * Uses FFmpeg via the files microservice to:
 * - Replace video audio with new audio
 * - Mix audio tracks together
 * - Add background music to video
 */
@Injectable()
export class SoundOverlayProcessor {
  constructor(
    private readonly filesClient: FilesClientService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Process a sound overlay request
   */
  async process(input: SoundOverlayInput): Promise<SoundOverlayOutput> {
    this.logger.log('Processing SoundOverlay', {
      audioVolume: input.audioVolume,
      fadeIn: input.fadeIn,
      fadeOut: input.fadeOut,
      mixMode: input.mixMode,
      soundUrl: input.soundUrl.substring(0, 50),
      videoUrl: input.videoUrl.substring(0, 50),
      videoVolume: input.videoVolume,
    });

    // Validate inputs
    if (!input.videoUrl) {
      throw new Error('Video URL is required');
    }
    if (!input.soundUrl) {
      throw new Error('Sound URL is required');
    }

    // Generate unique output path
    const timestamp = Date.now();
    const outputKey = `workflow/sound-overlay/${timestamp}.mp4`;

    // Call files microservice for audio overlay
    const result = await this.overlayAudio(input, outputKey);

    return {
      duration: result.duration || 0,
      outputVideoUrl: result.publicUrl,
    };
  }

  /**
   * Call files microservice to overlay audio on video
   */
  private async overlayAudio(
    input: SoundOverlayInput,
    outputKey: string,
  ): Promise<{ publicUrl: string; duration?: number }> {
    // Get presigned upload URL for output
    const { publicUrl, s3Key } = await this.filesClient.getPresignedUploadUrl(
      outputKey,
      'video',
      'video/mp4',
    );

    // Call files microservice audio overlay endpoint
    const response = await this.callFilesServiceAudioOverlay({
      audioUrl: input.soundUrl,
      audioVolume: input.audioVolume,
      fadeIn: input.fadeIn,
      fadeOut: input.fadeOut,
      mixMode: input.mixMode,
      outputKey: s3Key,
      videoUrl: input.videoUrl,
      videoVolume: input.videoVolume,
    });

    return {
      duration: response.duration,
      publicUrl,
    };
  }

  /**
   * Call the files microservice audio overlay endpoint.
   * The endpoint handles downloading, FFmpeg processing, and S3 upload internally.
   */
  private async callFilesServiceAudioOverlay(params: {
    videoUrl: string;
    audioUrl: string;
    outputKey: string;
    mixMode: MixMode;
    audioVolume: number;
    videoVolume: number;
    fadeIn: number;
    fadeOut: number;
  }): Promise<{ publicUrl: string; duration?: number }> {
    try {
      const result = await this.filesClient.audioOverlay({
        audioUrl: params.audioUrl,
        audioVolume: params.audioVolume,
        fadeIn: params.fadeIn,
        fadeOut: params.fadeOut,
        mixMode: params.mixMode,
        outputKey: params.outputKey,
        videoUrl: params.videoUrl,
        videoVolume: params.videoVolume,
      });

      return {
        duration: result.duration,
        publicUrl: result.publicUrl,
      };
    } catch (error: unknown) {
      this.logger.error('Audio overlay processing failed', error);
      throw new Error(
        `Audio overlay failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}

import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import {
  OcrEngineUnavailableError,
  TesseractOcrService,
} from '@files/services/perception/tesseract-ocr.service';
import { S3Service } from '@files/services/s3/s3.service';
import { UploadService } from '@files/services/upload/upload.service';
import type {
  MediaPerceptionArtefactStatus,
  MediaPerceptionArtefacts,
  MediaPerceptionArtefactsRequest,
  MediaPerceptionDiagnostic,
  MediaPerceptionFingerprint,
  MediaPerceptionFrame,
  MediaPerceptionOcrEntry,
  MediaReadinessKind,
} from '@genfeedai/contracts/api-types/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { assertSafeSegment } from '@libs/security';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { BadRequestException, Injectable } from '@nestjs/common';
import sharp from 'sharp';

/** Longest edge of a stored frame; enough for OCR and a vision prompt. */
const FRAME_MAX_EDGE = 1024;
const FRAME_JPEG_QUALITY = 82;

/** Extension the downloaded source is written with, per media kind. */
const SOURCE_EXTENSION: Record<MediaReadinessKind, string> = {
  audio: '.mp3',
  image: '.png',
  video: '.mp4',
};

const createBadRequest = (message: string) => new BadRequestException(message);

type SampledFrames = {
  diagnostics: MediaPerceptionDiagnostic[];
  frames: MediaPerceptionFrame[];
  localPaths: string[];
  status: MediaPerceptionArtefactStatus;
};

type RecognizedText = {
  diagnostics: MediaPerceptionDiagnostic[];
  ocr: MediaPerceptionOcrEntry[];
  status: MediaPerceptionArtefactStatus;
};

/**
 * Model-free perception artefacts for one asset (#4879).
 *
 * Everything here runs on the files host: the asset is downloaded once,
 * evenly spaced frames are sampled with ffmpeg (a still image is its own
 * single frame), each frame is OCR'd locally, and the audio track is extracted
 * to a small mono MP3 for the API to transcribe. No vision or speech model is
 * called, which is what lets frames and OCR survive a provider outage.
 *
 * Stored objects are namespaced by organization and asset hash, so re-running
 * for the same bytes overwrites rather than accumulates.
 */
@Injectable()
export class MediaPerceptionArtefactsService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly ffmpegService: FFmpegService,
    private readonly s3Service: S3Service,
    private readonly uploadService: UploadService,
    private readonly ocrService: TesseractOcrService,
    private readonly logger: LoggerService,
  ) {}

  /** SHA-256 and size of the bytes behind `url`. */
  async fingerprint(url: string): Promise<MediaPerceptionFingerprint> {
    const workDir = this.createWorkDir();
    const sourcePath = path.join(workDir, 'source.bin');
    try {
      await this.s3Service.downloadFromUrl(url, sourcePath);
      return {
        assetHash: await MediaPerceptionArtefactsService.hashFile(sourcePath),
        sizeBytes: fs.statSync(sourcePath).size,
      };
    } finally {
      this.removeWorkDir(workDir);
    }
  }

  async extract(
    request: MediaPerceptionArtefactsRequest,
  ): Promise<MediaPerceptionArtefacts> {
    const organizationSegment = assertSafeSegment(
      request.organizationId,
      'organizationId',
      createBadRequest,
    );
    const workDir = this.createWorkDir();
    const sourcePath = path.join(
      workDir,
      `source${SOURCE_EXTENSION[request.kind]}`,
    );
    const storagePrefix = `perception/${organizationSegment}/${request.assetHash}`;

    try {
      await this.s3Service.downloadFromUrl(request.url, sourcePath);
      const assetHash =
        await MediaPerceptionArtefactsService.hashFile(sourcePath);
      if (assetHash !== request.assetHash) {
        // The bytes changed between fingerprint and extraction; artefacts for
        // the new bytes must not be filed under the old identity.
        throw new BadRequestException(
          'Asset bytes changed since they were fingerprinted',
        );
      }

      const durationSeconds =
        request.kind === 'image'
          ? null
          : await this.readDurationSeconds(sourcePath);

      const sampled = await this.sampleFrames(
        request.kind,
        sourcePath,
        workDir,
        storagePrefix,
        request.frameCount,
        durationSeconds,
      );
      const recognized = await this.recognizeText(sampled);
      const audio = await this.extractAudio(
        request.kind,
        sourcePath,
        workDir,
        storagePrefix,
      );

      return {
        assetHash,
        audioUrl: audio.url,
        diagnostics: [
          ...sampled.diagnostics,
          ...recognized.diagnostics,
          ...audio.diagnostics,
        ],
        durationSeconds,
        frames: sampled.frames,
        framesStatus: sampled.status,
        kind: request.kind,
        ocr: recognized.ocr,
        ocrStatus: recognized.status,
      };
    } finally {
      this.removeWorkDir(workDir);
    }
  }

  private async sampleFrames(
    kind: MediaReadinessKind,
    sourcePath: string,
    workDir: string,
    storagePrefix: string,
    frameCount: number,
    durationSeconds: number | null,
  ): Promise<SampledFrames> {
    if (kind === 'audio') {
      return {
        diagnostics: [],
        frames: [],
        localPaths: [],
        status: 'unavailable',
      };
    }

    const timestamps =
      kind === 'image'
        ? [null]
        : MediaPerceptionArtefactsService.sampleTimestamps(
            durationSeconds,
            frameCount,
          );

    const frames: MediaPerceptionFrame[] = [];
    const localPaths: string[] = [];
    const diagnostics: MediaPerceptionDiagnostic[] = [];

    for (const [index, timestampSeconds] of timestamps.entries()) {
      const rawPath = path.join(workDir, `frame-${index}-raw.jpg`);
      const framePath = path.join(workDir, `frame-${index}.jpg`);
      try {
        const input =
          timestampSeconds === null
            ? sourcePath
            : await this.ffmpegService.extractFrame(
                sourcePath,
                rawPath,
                timestampSeconds,
              );
        const info = await sharp(input)
          .rotate()
          .resize(FRAME_MAX_EDGE, FRAME_MAX_EDGE, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: FRAME_JPEG_QUALITY })
          .toFile(framePath);
        const uploaded = await this.uploadService.uploadToS3(
          `${storagePrefix}/frame-${index}.jpg`,
          'images',
          { path: framePath, type: 'file' },
        );
        frames.push({
          height: info.height || null,
          index,
          storageKey: uploaded.s3Key || null,
          timestampSeconds,
          url: uploaded.publicUrl,
          width: info.width || null,
        });
        localPaths.push(framePath);
      } catch (error: unknown) {
        this.logger.warn(
          `${this.constructorName} frame ${index} failed: ${getErrorMessage(error)}`,
        );
        diagnostics.push({
          artefact: 'frames',
          code: 'frame_extraction_failed',
          message: `Frame ${index + 1} of ${timestamps.length} could not be extracted.`,
        });
      }
    }

    return {
      diagnostics,
      frames,
      localPaths,
      status: frames.length > 0 ? 'ready' : 'failed',
    };
  }

  private async recognizeText(sampled: SampledFrames): Promise<RecognizedText> {
    if (sampled.status === 'unavailable') {
      return { diagnostics: [], ocr: [], status: 'unavailable' };
    }
    if (sampled.frames.length === 0) {
      return {
        diagnostics: [
          {
            artefact: 'ocr',
            code: 'ocr_no_frames',
            message: 'No frames were available to read on-screen text from.',
          },
        ],
        ocr: [],
        status: 'failed',
      };
    }

    const ocr: MediaPerceptionOcrEntry[] = [];
    const diagnostics: MediaPerceptionDiagnostic[] = [];
    for (const [position, frame] of sampled.frames.entries()) {
      try {
        ocr.push({
          frameIndex: frame.index,
          text: await this.ocrService.recognize(sampled.localPaths[position]),
        });
      } catch (error: unknown) {
        if (error instanceof OcrEngineUnavailableError) {
          return {
            diagnostics: [
              {
                artefact: 'ocr',
                code: 'ocr_engine_unavailable',
                message: 'No OCR engine is installed on the files host.',
              },
            ],
            ocr: [],
            status: 'unavailable',
          };
        }
        diagnostics.push({
          artefact: 'ocr',
          code: 'ocr_frame_failed',
          message: `On-screen text could not be read from frame ${frame.index + 1}.`,
        });
      }
    }

    return {
      diagnostics,
      ocr,
      status: ocr.length > 0 ? 'ready' : 'failed',
    };
  }

  private async extractAudio(
    kind: MediaReadinessKind,
    sourcePath: string,
    workDir: string,
    storagePrefix: string,
  ): Promise<{ diagnostics: MediaPerceptionDiagnostic[]; url: string | null }> {
    if (kind === 'image') {
      return { diagnostics: [], url: null };
    }
    if (
      kind === 'video' &&
      !(await this.ffmpegService.hasAudioStream(sourcePath))
    ) {
      return { diagnostics: [], url: null };
    }

    const audioPath = path.join(workDir, 'audio.mp3');
    try {
      await this.ffmpegService.convertVideoToAudio(sourcePath, audioPath, {
        audioBitrate: '64k',
        audioCodec: 'libmp3lame',
        format: 'mp3',
      });
      const uploaded = await this.uploadService.uploadToS3(
        `${storagePrefix}/audio.mp3`,
        'audios',
        { path: audioPath, type: 'file' },
      );
      return { diagnostics: [], url: uploaded.publicUrl };
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} audio extraction failed: ${getErrorMessage(error)}`,
      );
      return {
        diagnostics: [
          {
            artefact: 'transcript',
            code: 'audio_extraction_failed',
            message:
              'The audio track could not be extracted for transcription.',
          },
        ],
        url: null,
      };
    }
  }

  private async readDurationSeconds(
    sourcePath: string,
  ): Promise<number | null> {
    try {
      const probe = await this.ffmpegService.probe(sourcePath);
      const duration = Number(probe.format?.duration);
      return Number.isFinite(duration) && duration > 0 ? duration : null;
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} probe failed: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  /**
   * Midpoints of `count` equal segments, so the first and last frames avoid
   * the fade-in and fade-out that often open and close generated video.
   */
  static sampleTimestamps(
    durationSeconds: number | null,
    count: number,
  ): number[] {
    if (!durationSeconds || durationSeconds <= 0) {
      return [0];
    }
    return Array.from({ length: count }, (_, index) =>
      Number(((durationSeconds * (index + 0.5)) / count).toFixed(3)),
    );
  }

  static async hashFile(filePath: string): Promise<string> {
    const hash = createHash('sha256');
    await pipeline(fs.createReadStream(filePath), hash);
    return hash.digest('hex');
  }

  private createWorkDir(): string {
    const workDir = this.ffmpegService.getTempPath('perception', randomUUID());
    fs.mkdirSync(workDir, { recursive: true });
    return workDir;
  }

  private removeWorkDir(workDir: string): void {
    try {
      fs.rmSync(workDir, { force: true, recursive: true });
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} temp cleanup failed: ${getErrorMessage(error)}`,
      );
    }
  }
}

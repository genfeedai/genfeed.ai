import path from 'node:path';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { UploadService } from '@files/services/upload/upload.service';
import { YtDlpService } from '@files/services/ytdlp/ytdlp.service';
import {
  CLIP_REFERENCE_FRAME_SCHEMA_VERSION,
  type ClipReferenceFrameCandidate,
  type ClipReferenceFrameDiagnostic,
  type ClipReferenceFrameSet,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const MAX_REFERENCE_FRAMES = 5;
const YOUTUBE_HOSTS = new Set([
  'm.youtube.com',
  'music.youtube.com',
  'www.youtube.com',
  'youtu.be',
  'youtube.com',
]);

export interface ClipReferenceFrameExtractionInput {
  organizationId: string;
  projectId: string;
  sourceUrl: string;
  timestamps: number[];
}

function unavailableReferenceFrames(
  code: string,
  message: string,
): ClipReferenceFrameSet {
  return {
    candidates: [],
    diagnostics: [{ code, message, severity: 'warning' }],
    schemaVersion: CLIP_REFERENCE_FRAME_SCHEMA_VERSION,
    selectedCandidateId: null,
    status: 'unavailable',
  };
}

function normalizeTimestamps(timestamps: number[]): number[] {
  return [
    ...new Set(
      timestamps
        .filter(
          (timestamp) => Number.isFinite(timestamp) && timestamp >= 0,
        )
        .map((timestamp) => Math.round(timestamp * 1000) / 1000),
    ),
  ]
    .sort((left, right) => left - right)
    .slice(0, MAX_REFERENCE_FRAMES);
}

function validatePublicYoutubeUrl(sourceUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error('Source URL is invalid');
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    !YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())
  ) {
    throw new Error('Source URL must be a public HTTPS YouTube URL');
  }

  return parsed.toString();
}

function storageSegment(value: string): string {
  if (value.trim().length === 0) {
    throw new Error('Storage scope is missing');
  }

  return encodeURIComponent(value.trim());
}

@Injectable()
export class ClipReferenceFrameExtractionService {
  constructor(
    private readonly ffmpegService: FFmpegService,
    private readonly uploadService: UploadService,
    private readonly ytDlpService: YtDlpService,
    private readonly logger: LoggerService,
  ) {}

  async extract(
    input: ClipReferenceFrameExtractionInput,
  ): Promise<ClipReferenceFrameSet> {
    const timestamps = normalizeTimestamps(input.timestamps);
    if (timestamps.length === 0) {
      return unavailableReferenceFrames(
        'clip_reference_no_timestamps',
        'No valid source timestamps were available for reference extraction.',
      );
    }

    let sourceUrl: string;
    let organizationId: string;
    let projectId: string;
    try {
      sourceUrl = validatePublicYoutubeUrl(input.sourceUrl);
      organizationId = storageSegment(input.organizationId);
      projectId = storageSegment(input.projectId);
    } catch (error: unknown) {
      this.logger.warn('Clip reference source validation failed', error);
      return unavailableReferenceFrames(
        'clip_reference_invalid_source',
        'The source could not be used for reference extraction.',
      );
    }

    const tempDir = this.ffmpegService.getTempPath(
      'clip-reference-frames',
      projectId,
    );
    const sourcePath = path.join(tempDir, 'source.mp4');
    const framePaths = timestamps.map((_, index) =>
      path.join(tempDir, `frame-${index + 1}.jpg`),
    );

    try {
      await this.ytDlpService.downloadVideo(sourceUrl, sourcePath);

      const candidates: ClipReferenceFrameCandidate[] = [];
      for (const [index, timestampSeconds] of timestamps.entries()) {
        const timestampMs = Math.round(timestampSeconds * 1000);
        const candidateId = `frame-${index + 1}-${timestampMs}`;
        const framePath = framePaths[index]!;
        const storageKey =
          `ingredients/images/organizations/${organizationId}/clips/` +
          `${projectId}/reference-frames/${candidateId}.jpg`;

        try {
          await this.ffmpegService.extractFrame(
            sourcePath,
            framePath,
            timestampSeconds,
          );
          const uploaded = await this.uploadService.uploadToS3(
            `organizations/${organizationId}/clips/${projectId}/` +
              `reference-frames/${candidateId}.jpg`,
            'images',
            { path: framePath, type: 'file' },
          );

          candidates.push({
            assetId: candidateId,
            diagnostics: [],
            height: uploaded.height || undefined,
            id: candidateId,
            mimeType: 'image/jpeg',
            status: 'available',
            storageKey,
            timestampSeconds,
            url: uploaded.publicUrl,
            width: uploaded.width || undefined,
          });
        } catch (error: unknown) {
          this.logger.warn('Clip reference candidate extraction failed', {
            candidateId,
            error,
            projectId: input.projectId,
          });
          candidates.push({
            assetId: candidateId,
            diagnostics: [
              {
                candidateId,
                code: 'clip_reference_candidate_failed',
                message: 'This reference frame could not be extracted.',
                severity: 'warning',
              },
            ],
            id: candidateId,
            status: 'failed',
            timestampSeconds,
          });
        }
      }

      const availableCount = candidates.filter(
        (candidate) => candidate.status === 'available',
      ).length;
      const diagnostics: ClipReferenceFrameDiagnostic[] =
        availableCount === candidates.length
          ? []
          : [
              {
                code: 'clip_reference_candidates_incomplete',
                message: `${candidates.length - availableCount} reference frame candidate(s) could not be extracted.`,
                severity: 'warning',
              },
            ];

      return {
        candidates,
        diagnostics,
        schemaVersion: CLIP_REFERENCE_FRAME_SCHEMA_VERSION,
        selectedCandidateId: null,
        status:
          availableCount === candidates.length
            ? 'ready'
            : availableCount > 0
              ? 'partial'
              : 'unavailable',
      };
    } catch (error: unknown) {
      this.logger.warn('Clip reference source download failed', {
        error,
        projectId: input.projectId,
      });
      return unavailableReferenceFrames(
        'clip_reference_download_failed',
        'The source video was unavailable for reference extraction.',
      );
    } finally {
      await this.ffmpegService.cleanupTempFiles(sourcePath, ...framePaths);
    }
  }
}

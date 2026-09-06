import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { ConfigService } from '@files/config/config.service';
import { downloadPublicMedia } from '@files/services/audio-overlay/media-download';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { UploadService } from '@files/services/upload/upload.service';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';

export type SpeechAssemblyRequest = {
  segments: { audioUrl: string; startSeconds: number; endSeconds: number }[];
  durationSeconds: number;
  outputKey?: string;
};

const MAX_SEGMENT_BYTES = 25 * 1024 * 1024;
const TOTAL_SEGMENT_BYTES_BUDGET = 200 * 1024 * 1024;

@Injectable()
export class SpeechAssemblyService {
  constructor(
    private readonly ffmpeg: FFmpegService,
    private readonly upload: UploadService,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  async assemble(
    body: SpeechAssemblyRequest,
  ): Promise<{ publicUrl: string; s3Key: string; duration: number }> {
    if (
      !Number.isFinite(body.durationSeconds) ||
      body.durationSeconds <= 0 ||
      body.durationSeconds > 3600 ||
      !Array.isArray(body.segments) ||
      body.segments.length === 0 ||
      body.segments.length > 200
    ) {
      throw new BadRequestException(
        'Provide 1–200 speech segments and a duration between 0 and 3600 seconds',
      );
    }
    let previousEnd = 0;
    for (const segment of body.segments) {
      if (
        !segment ||
        typeof segment !== 'object' ||
        !segment.audioUrl ||
        !Number.isFinite(segment.startSeconds) ||
        !Number.isFinite(segment.endSeconds) ||
        segment.startSeconds < previousEnd ||
        segment.endSeconds <= segment.startSeconds ||
        segment.endSeconds > body.durationSeconds
      ) {
        throw new BadRequestException(
          'Speech segments must be ordered, non-overlapping and inside the requested duration',
        );
      }
      previousEnd = segment.endSeconds;
    }
    const dir = await fs.mkdtemp(
      path.join(this.ffmpeg.getTempPath('speech-assembly'), 'speech-'),
    );
    try {
      const args: string[] = [];
      const filters: string[] = [];
      let remainingBudgetBytes = TOTAL_SEGMENT_BYTES_BUDGET;
      for (const [index, segment] of body.segments.entries()) {
        const file = path.join(dir, `${index}.mp3`);
        const segmentLimitBytes = Math.min(
          MAX_SEGMENT_BYTES,
          remainingBudgetBytes,
        );
        if (segmentLimitBytes <= 0) {
          throw new BadRequestException(
            'Speech segments exceed the total assembly size budget',
          );
        }
        const downloaded = await downloadPublicMedia(
          segment.audioUrl,
          segmentLimitBytes,
          this.configService,
        );
        remainingBudgetBytes -= downloaded.byteLength;
        await fs.writeFile(file, downloaded);
        const metadata = await this.ffmpeg.probe(file);
        const duration = Number(metadata.format.duration);
        if (
          !metadata.streams.some((stream) => stream.codec_type === 'audio') ||
          !Number.isFinite(duration) ||
          duration <= 0
        ) {
          throw new BadRequestException(
            `Segment ${index + 1} has no valid audio`,
          );
        }
        const available = segment.endSeconds - segment.startSeconds;
        if (duration > available) {
          throw new BadRequestException({
            message: `Segment ${index + 1} exceeds its time window; regenerate or shorten the speech`,
            segmentIndex: index,
            actualDurationSeconds: duration,
            availableDurationSeconds: available,
          });
        }
        args.push('-i', file);
        filters.push(
          `[${index}:a]asetpts=PTS-STARTPTS,adelay=${Math.round(segment.startSeconds * 1000)}:all=1[a${index}]`,
        );
      }
      filters.push(
        `${body.segments.map((_, index) => `[a${index}]`).join('')}amix=inputs=${body.segments.length}:duration=longest:normalize=0,apad,atrim=duration=${body.durationSeconds}[out]`,
      );
      const output = path.join(dir, 'speech.wav');
      const result = await this.ffmpeg.executeFFmpegCapture([
        ...args,
        '-filter_complex',
        filters.join(';'),
        '-map',
        '[out]',
        '-ar',
        '48000',
        '-c:a',
        'pcm_s16le',
        '-y',
        output,
      ]);
      if (result.code !== 0) throw new Error('Speech assembly failed');
      const key = body.outputKey || `speech-assembly/${randomUUID()}.wav`;
      const uploaded = await this.upload.uploadToS3(key, 'audios', {
        path: output,
        type: 'file',
      });
      return {
        publicUrl: uploaded.publicUrl,
        s3Key: `ingredients/audios/${key}`,
        duration: body.durationSeconds,
      };
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
}

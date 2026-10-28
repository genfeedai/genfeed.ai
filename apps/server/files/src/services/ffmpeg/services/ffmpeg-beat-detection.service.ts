import { spawn } from 'node:child_process';
import { SecurityUtil } from '@files/helpers/utils/security/security.util';
import {
  analyzeBeatGrid,
  type BeatGridOptions,
} from '@files/services/ffmpeg/helpers/beat-grid.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface BeatAnalysisResult {
  tempo: number;
  beatTimestamps: number[];
  downbeats: number[];
  beatCount: number;
  confidence: number;
}

/** Mono, low rate: onsets live well below 11 kHz and it keeps decoding small. */
const ANALYSIS_SAMPLE_RATE = 22_050;
/** Cuts need the grid only as far as the video runs. */
const MAX_ANALYSIS_SECONDS = 300;
const FLOAT_BYTES = 4;

/**
 * Tempo and beat timestamps for a music file: ffmpeg decodes it to mono PCM
 * and the onset envelope finds the pulse. No native analyzer is needed.
 */
@Injectable()
export class FFmpegBeatDetectionService {
  private readonly constructorName = String(this.constructor.name);

  constructor(private readonly loggerService: LoggerService) {}

  /**
   * The beat grid of the first minutes of `audioPath`, or `null` when the
   * audio has no steady pulse to cut on (silence, ambient pads).
   */
  async analyzeBeat(
    audioPath: string,
    options: BeatGridOptions = {},
  ): Promise<BeatAnalysisResult | null> {
    const validatedPath = SecurityUtil.validateFilePath(audioPath);
    SecurityUtil.validateFileExtension(validatedPath);
    await SecurityUtil.validateFileExists(validatedPath);

    const samples = await this.decodeMono(validatedPath);
    const grid = analyzeBeatGrid(samples, ANALYSIS_SAMPLE_RATE, options);
    this.loggerService.debug(`${this.constructorName} analyzed beats`, {
      audioPath: validatedPath,
      beatCount: grid?.beatTimestamps.length ?? 0,
      confidence: grid?.confidence,
      tempo: grid?.tempo,
    });
    if (!grid) {
      return null;
    }
    return {
      beatCount: grid.beatTimestamps.length,
      beatTimestamps: grid.beatTimestamps,
      confidence: grid.confidence,
      downbeats: grid.downbeats,
      tempo: grid.tempo,
    };
  }

  private decodeMono(audioPath: string): Promise<Float32Array> {
    return new Promise((resolve, reject) => {
      const decoder = spawn('ffmpeg', [
        '-v',
        'error',
        '-nostdin',
        '-i',
        audioPath,
        '-t',
        String(MAX_ANALYSIS_SECONDS),
        '-vn',
        '-ac',
        '1',
        '-ar',
        String(ANALYSIS_SAMPLE_RATE),
        '-f',
        'f32le',
        'pipe:1',
      ]);
      const chunks: Buffer[] = [];
      let stderr = '';
      decoder.stdout?.on('data', (data: Buffer) => chunks.push(data));
      decoder.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      decoder.on('error', (error: Error) =>
        reject(new Error(`ffmpeg not available: ${error.message}`)),
      );
      decoder.on('close', (code: number | null) => {
        if (code !== 0) {
          reject(new Error(`Audio decode failed with code ${code}: ${stderr}`));
          return;
        }
        const bytes = Buffer.concat(chunks);
        // Copy to an aligned buffer: Buffer slices share a pooled ArrayBuffer.
        const samples = new Float32Array(
          Math.floor(bytes.length / FLOAT_BYTES),
        );
        for (let index = 0; index < samples.length; index++) {
          samples[index] = bytes.readFloatLE(index * FLOAT_BYTES);
        }
        resolve(samples);
      });
    });
  }
}

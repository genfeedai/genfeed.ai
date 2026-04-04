import { spawn } from 'node:child_process';
import path from 'node:path';
import { SecurityUtil } from '@files/helpers/utils/security/security.util';
import { FFmpegCoreService } from '@files/services/ffmpeg/services/ffmpeg-core.service';
import { BeatSensitivity } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface BeatAnalysisResult {
  tempo: number;
  beatTimestamps: number[];
  downbeats: number[];
  beatCount: number;
  analysisMethod: 'aubio' | 'ffmpeg';
  confidence: number;
}

interface AubioOnset {
  timestamp: number;
  confidence: number;
}

/**
 * FFmpeg Beat Detection Service
 *
 * Detects tempo and beat timestamps from audio files.
 * Uses aubio for accurate onset detection with FFmpeg fallback.
 */
@Injectable()
export class FFmpegBeatDetectionService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly core: FFmpegCoreService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Analyze audio file for beats and tempo
   */
  async analyzeBeat(
    audioPath: string,
    options: {
      minBpm?: number;
      maxBpm?: number;
      beatSensitivity?: BeatSensitivity;
    } = {},
  ): Promise<BeatAnalysisResult> {
    const {
      minBpm = 60,
      maxBpm = 200,
      beatSensitivity = BeatSensitivity.MEDIUM,
    } = options;

    const validatedPath = SecurityUtil.validateFilePath(audioPath);
    SecurityUtil.validateFileExtension(validatedPath);
    await SecurityUtil.validateFileExists(validatedPath);

    this.loggerService.debug(`${this.constructorName} analyzing beats`, {
      audioPath: validatedPath,
      beatSensitivity,
      maxBpm,
      minBpm,
    });

    // Try aubio first, fallback to FFmpeg volume analysis
    try {
      const aubioResult = await this.analyzeWithAubio(validatedPath, {
        beatSensitivity,
        maxBpm,
        minBpm,
      });
      return aubioResult;
    } catch (aubioError) {
      this.loggerService.warn(
        `${this.constructorName} aubio failed, falling back to FFmpeg`,
        {
          error:
            aubioError instanceof Error
              ? aubioError.message
              : String(aubioError),
        },
      );

      return this.analyzeWithFFmpeg(validatedPath, { maxBpm, minBpm });
    }
  }

  /**
   * Analyze beats using aubio (preferred method)
   */
  private async analyzeWithAubio(
    audioPath: string,
    options: {
      minBpm: number;
      maxBpm: number;
      beatSensitivity: BeatSensitivity;
    },
  ): Promise<BeatAnalysisResult> {
    const { minBpm, maxBpm, beatSensitivity } = options;

    // First, extract audio to WAV for aubio processing
    const tempWavPath = path.join(
      this.core.getTempPath('beat-analysis'),
      `${Date.now()}_audio.wav`,
    );

    try {
      // Convert to WAV for aubio
      await this.extractAudioToWav(audioPath, tempWavPath);

      // Get tempo using aubio tempo
      const tempo = await this.getTempoWithAubio(tempWavPath);

      // Clamp tempo to specified range
      const clampedTempo = Math.max(minBpm, Math.min(maxBpm, tempo));

      // Get beat timestamps using aubio onset
      const onsets = await this.getOnsetsWithAubio(
        tempWavPath,
        beatSensitivity,
      );

      // Filter onsets based on tempo-derived beat intervals
      const beatInterval = 60 / clampedTempo;
      const beatTimestamps = this.filterOnsetsToBeats(onsets, beatInterval);

      // Identify downbeats (every 4th beat typically)
      const downbeats = beatTimestamps.filter((_, index) => index % 4 === 0);

      // Calculate average confidence
      const relevantOnsets = onsets.filter((o) =>
        beatTimestamps.some((bt) => Math.abs(bt - o.timestamp) < 0.05),
      );
      const confidence =
        relevantOnsets.length > 0
          ? relevantOnsets.reduce((sum, o) => sum + o.confidence, 0) /
            relevantOnsets.length
          : 0.5;

      return {
        analysisMethod: 'aubio',
        beatCount: beatTimestamps.length,
        beatTimestamps,
        confidence,
        downbeats,
        tempo: clampedTempo,
      };
    } finally {
      await this.core.cleanupTempFiles(tempWavPath);
    }
  }

  /**
   * Extract audio to WAV format for processing
   */
  private async extractAudioToWav(
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    await this.core.ensureOutputDir(outputPath);

    const args = [
      '-i',
      inputPath,
      '-vn',
      '-acodec',
      'pcm_s16le',
      '-ar',
      '44100',
      '-ac',
      '2',
      '-y',
      outputPath,
    ];

    await this.core.executeFFmpeg(args);
  }

  /**
   * Get tempo using aubio tempo command
   */
  private getTempoWithAubio(wavPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const process = spawn('aubio', ['tempo', '-i', wavPath]);
      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          // aubio tempo outputs BPM on the last line
          const lines = stdout.trim().split('\n');
          const lastLine = lines[lines.length - 1];
          const tempo = parseFloat(lastLine);

          if (Number.isFinite(tempo) && tempo > 0) {
            resolve(tempo);
          } else {
            reject(new Error(`Invalid tempo from aubio: ${lastLine}`));
          }
        } else {
          reject(new Error(`aubio tempo failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`aubio not available: ${error.message}`));
      });
    });
  }

  /**
   * Get onset timestamps using aubio onset command
   */
  private getOnsetsWithAubio(
    wavPath: string,
    sensitivity: BeatSensitivity,
  ): Promise<AubioOnset[]> {
    return new Promise((resolve, reject) => {
      // Map sensitivity to aubio threshold
      const thresholds: Record<BeatSensitivity, string> = {
        [BeatSensitivity.HIGH]: '0.1',
        [BeatSensitivity.LOW]: '0.5',
        [BeatSensitivity.MEDIUM]: '0.3',
      };
      const threshold = thresholds[sensitivity];

      const process = spawn('aubio', [
        'onset',
        '-i',
        wavPath,
        '-t',
        threshold,
        '-O',
        'stdout',
      ]);
      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          const onsets: AubioOnset[] = [];
          const lines = stdout.trim().split('\n');

          for (const line of lines) {
            const timestamp = parseFloat(line.trim());
            if (Number.isFinite(timestamp) && timestamp >= 0) {
              onsets.push({ confidence: 0.8, timestamp });
            }
          }

          resolve(onsets);
        } else {
          reject(new Error(`aubio onset failed with code ${code}: ${stderr}`));
        }
      });

      process.on('error', (error) => {
        reject(new Error(`aubio not available: ${error.message}`));
      });
    });
  }

  /**
   * Filter raw onsets to regular beat timestamps based on tempo
   */
  private filterOnsetsToBeats(
    onsets: AubioOnset[],
    beatInterval: number,
  ): number[] {
    if (onsets.length === 0) {
      return [];
    }

    const beatTimestamps: number[] = [];
    let expectedBeatTime = onsets[0]?.timestamp || 0;

    // Find the best-matching onset for each expected beat
    const maxDuration =
      Math.max(...onsets.map((o) => o.timestamp), 0) + beatInterval;

    while (expectedBeatTime < maxDuration) {
      // Find onset closest to expected beat time
      const tolerance = beatInterval * 0.4;
      const nearbyOnsets = onsets.filter(
        (o) => Math.abs(o.timestamp - expectedBeatTime) < tolerance,
      );

      if (nearbyOnsets.length > 0) {
        // Use the onset with highest confidence
        const bestOnset = nearbyOnsets.reduce((best, current) =>
          current.confidence > best.confidence ? current : best,
        );
        beatTimestamps.push(bestOnset.timestamp);
      } else {
        // No onset found, use expected time
        beatTimestamps.push(expectedBeatTime);
      }

      expectedBeatTime += beatInterval;
    }

    return beatTimestamps;
  }

  /**
   * Analyze beats using FFmpeg volume analysis (fallback method)
   */
  private async analyzeWithFFmpeg(
    audioPath: string,
    options: { minBpm: number; maxBpm: number },
  ): Promise<BeatAnalysisResult> {
    const { minBpm, maxBpm } = options;

    // Get audio duration
    const probeData = await this.core.probe(audioPath);
    const duration = parseFloat(probeData.format?.duration || '0');

    // Extract volume levels over time
    const volumeData = await this.extractVolumeProfile(audioPath);

    // Detect beats from volume peaks
    const { beatTimestamps, tempo } = this.detectBeatsFromVolume(
      volumeData,
      duration,
      minBpm,
      maxBpm,
    );

    // Identify downbeats
    const downbeats = beatTimestamps.filter((_, index) => index % 4 === 0);

    return {
      analysisMethod: 'ffmpeg',
      beatCount: beatTimestamps.length,
      beatTimestamps,
      confidence: 0.6, // Lower confidence for FFmpeg method
      downbeats,
      tempo,
    };
  }

  /**
   * Extract volume profile using FFmpeg
   */
  private extractVolumeProfile(audioPath: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const args = [
        '-i',
        audioPath,
        '-af',
        'astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-',
        '-f',
        'null',
        '-',
      ];

      const process = spawn('ffmpeg', args);
      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (_code) => {
        // Parse RMS levels from output
        const volumes: number[] = [];
        const rmsPattern = /lavfi\.astats\.Overall\.RMS_level=([-\d.]+)/g;
        let match;

        const output = stdout || stderr;
        while ((match = rmsPattern.exec(output)) !== null) {
          const rms = parseFloat(match[1]);
          if (Number.isFinite(rms)) {
            // Convert dB to linear scale
            volumes.push(10 ** (rms / 20));
          }
        }

        if (volumes.length > 0) {
          resolve(volumes);
        } else {
          // Generate synthetic volume data if parsing fails
          resolve(this.generateSyntheticVolumeData());
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Generate synthetic volume data for testing
   */
  private generateSyntheticVolumeData(): number[] {
    // Generate a simple pattern for fallback
    const samples = 100;
    const volumes: number[] = [];

    for (let i = 0; i < samples; i++) {
      // Simulate periodic beats
      const beatPattern = Math.sin((i / samples) * Math.PI * 30) * 0.5 + 0.5;
      volumes.push(beatPattern);
    }

    return volumes;
  }

  /**
   * Detect beats from volume profile
   */
  private detectBeatsFromVolume(
    volumes: number[],
    duration: number,
    minBpm: number,
    maxBpm: number,
  ): { beatTimestamps: number[]; tempo: number } {
    if (volumes.length === 0 || duration === 0) {
      // Return default 120 BPM pattern
      const tempo = 120;
      const beatInterval = 60 / tempo;
      const beatTimestamps: number[] = [];

      for (let t = 0; t < duration; t += beatInterval) {
        beatTimestamps.push(t);
      }

      return { beatTimestamps, tempo };
    }

    // Find peaks in volume data
    const peaks: number[] = [];
    const sampleDuration = duration / volumes.length;

    for (let i = 1; i < volumes.length - 1; i++) {
      if (volumes[i] > volumes[i - 1] && volumes[i] > volumes[i + 1]) {
        // Peak detected
        const threshold = this.calculateDynamicThreshold(volumes);
        if (volumes[i] > threshold) {
          peaks.push(i * sampleDuration);
        }
      }
    }

    // Calculate tempo from peak intervals
    if (peaks.length < 2) {
      const tempo = 120;
      const beatInterval = 60 / tempo;
      const beatTimestamps: number[] = [];

      for (let t = 0; t < duration; t += beatInterval) {
        beatTimestamps.push(t);
      }

      return { beatTimestamps, tempo };
    }

    const intervals: number[] = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push(peaks[i] - peaks[i - 1]);
    }

    // Calculate median interval
    intervals.sort((a, b) => a - b);
    const medianInterval = intervals[Math.floor(intervals.length / 2)];

    // Convert interval to tempo
    let tempo = 60 / medianInterval;

    // Clamp to valid range
    tempo = Math.max(minBpm, Math.min(maxBpm, tempo));

    // Generate regular beat timestamps based on detected tempo
    const beatInterval = 60 / tempo;
    const beatTimestamps: number[] = [];

    for (let t = 0; t < duration; t += beatInterval) {
      beatTimestamps.push(t);
    }

    return { beatTimestamps, tempo };
  }

  /**
   * Calculate dynamic threshold for peak detection
   */
  private calculateDynamicThreshold(volumes: number[]): number {
    if (volumes.length === 0) {
      return 0.5;
    }

    const sum = volumes.reduce((a, b) => a + b, 0);
    const mean = sum / volumes.length;
    const variance =
      volumes.reduce((acc, v) => acc + (v - mean) ** 2, 0) / volumes.length;
    const stdDev = Math.sqrt(variance);

    return mean + stdDev * 0.5;
  }
}

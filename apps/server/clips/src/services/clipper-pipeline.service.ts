import { ConfigService } from '@clips/config/config.service';
import type { IClipProject } from '@clips/interfaces/clip-project.interface';
import { ClipProjectStatus } from '@clips/interfaces/clip-project.interface';
import type { IHighlight } from '@clips/interfaces/highlight.interface';
import type { IPipelineConfig } from '@clips/interfaces/pipeline-config.interface';
import { DEFAULT_PIPELINE_CONFIG } from '@clips/interfaces/pipeline-config.interface';
import { ClipExtractorService } from '@clips/services/clip-extractor.service';
import { HighlightDetectorService } from '@clips/services/highlight-detector.service';
import { TranscriptionService } from '@clips/services/transcription.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class ClipperPipelineService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly transcriptionService: TranscriptionService,
    private readonly highlightDetector: HighlightDetectorService,
    private readonly clipExtractor: ClipExtractorService,
  ) {}

  async startPipeline(projectId: string): Promise<void> {
    const methodName = `${this.constructorName}.startPipeline`;
    this.logger.log(
      `${methodName} Starting pipeline for project: ${projectId}`,
    );

    let project: IClipProject;

    try {
      project = await this.getProject(projectId);
    } catch (error: unknown) {
      this.logger.error(`${methodName} Failed to fetch project`, error);
      return;
    }

    const pipelineConfig = this.buildPipelineConfig(project);

    try {
      // Stage 1: Update status to transcribing
      await this.updateProject(projectId, {
        progress: 5,
        status: ClipProjectStatus.TRANSCRIBING,
      });

      // Stage 2: Extract audio
      this.logger.log(`${methodName} Stage 2: Extracting audio`);
      const audioResult = await this.transcriptionService.extractAudio(
        project.sourceVideoUrl,
        project.user,
        project.organization,
      );
      await this.updateProject(projectId, { progress: 15 });

      // Stage 3: Transcribe
      this.logger.log(`${methodName} Stage 3: Transcribing audio`);
      const transcription = await this.transcriptionService.transcribe(
        audioResult.audioUrl,
        project.language,
      );
      await this.updateProject(projectId, {
        progress: 35,
        status: ClipProjectStatus.ANALYZING,
        transcriptSegments: transcription.segments,
        transcriptSrt: transcription.srt,
        transcriptText: transcription.text,
      });

      // Stage 4: Detect highlights
      this.logger.log(`${methodName} Stage 4: Detecting highlights`);
      const highlightResult = await this.highlightDetector.detectHighlights(
        transcription.text,
        transcription.segments,
        pipelineConfig,
      );

      if (highlightResult.highlights.length === 0) {
        await this.updateProject(projectId, {
          progress: 100,
          status: ClipProjectStatus.COMPLETED,
        });
        this.logger.log(
          `${methodName} No highlights detected, completing with 0 clips`,
        );
        return;
      }

      await this.updateProject(projectId, {
        progress: 50,
        status: ClipProjectStatus.CLIPPING,
      });

      // Create clip result records in API
      const clipResults = await this.createClipResults(
        project,
        highlightResult.highlights,
      );

      // Stage 5: Extract clips
      this.logger.log(
        `${methodName} Stage 5: Extracting ${highlightResult.highlights.length} clips`,
      );
      const progressPerClip = 30 / highlightResult.highlights.length;
      let currentProgress = 50;

      for (let i = 0; i < highlightResult.highlights.length; i++) {
        const highlight = highlightResult.highlights[i];
        const clipResultId = clipResults[i]?._id;

        try {
          await this.updateClipResult(clipResultId, { status: 'extracting' });

          const extractResult = await this.clipExtractor.extractClip(
            project.sourceVideoUrl,
            highlight.start_time,
            highlight.end_time,
            project.user,
            project.organization,
          );

          await this.updateClipResult(clipResultId, {
            status: pipelineConfig.addCaptions ? 'captioning' : 'completed',
            videoS3Key: extractResult.videoS3Key,
            videoUrl: extractResult.videoUrl,
          });

          // Stage 6: Add captions (if enabled)
          if (pipelineConfig.addCaptions) {
            const clipSrt = this.generateClipSrt(
              transcription.segments,
              highlight.start_time,
              highlight.end_time,
            );

            const captionResult = await this.clipExtractor.addCaptions(
              extractResult.videoUrl,
              clipSrt,
              project.user,
              project.organization,
            );

            await this.updateClipResult(clipResultId, {
              captionedVideoS3Key: captionResult.captionedVideoS3Key,
              captionedVideoUrl: captionResult.captionedVideoUrl,
              captionSrt: clipSrt,
              status: 'completed',
            });
          }
        } catch (clipError: unknown) {
          this.logger.error(
            `${methodName} Failed to process clip ${i + 1}`,
            clipError,
          );
          await this.updateClipResult(clipResultId, { status: 'failed' });
        }

        currentProgress += progressPerClip;
        await this.updateProject(projectId, {
          progress: Math.min(Math.round(currentProgress), 95),
        });
      }

      // Pipeline complete
      await this.updateProject(projectId, {
        progress: 100,
        status: ClipProjectStatus.COMPLETED,
      });

      this.logger.log(
        `${methodName} Pipeline completed for project: ${projectId}`,
      );
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown pipeline error';
      this.logger.error(
        `${methodName} Pipeline failed: ${errorMessage}`,
        error,
      );

      await this.updateProject(projectId, {
        error: errorMessage,
        status: ClipProjectStatus.FAILED,
      }).catch((updateErr: unknown) => {
        this.logger.error(
          `${methodName} Failed to update project status`,
          updateErr,
        );
      });
    }
  }

  async retryPipeline(projectId: string): Promise<void> {
    const methodName = `${this.constructorName}.retryPipeline`;
    this.logger.log(
      `${methodName} Retrying pipeline for project: ${projectId}`,
    );

    await this.updateProject(projectId, {
      error: '',
      progress: 0,
      status: ClipProjectStatus.PENDING,
    });

    await this.startPipeline(projectId);
  }

  private buildPipelineConfig(project: IClipProject): IPipelineConfig {
    return {
      ...DEFAULT_PIPELINE_CONFIG,
      ...(project.settings && {
        addCaptions:
          project.settings.addCaptions ?? DEFAULT_PIPELINE_CONFIG.addCaptions,
        aspectRatio:
          project.settings.aspectRatio ?? DEFAULT_PIPELINE_CONFIG.aspectRatio,
        captionStyle:
          project.settings.captionStyle ?? DEFAULT_PIPELINE_CONFIG.captionStyle,
        maxClipDuration:
          project.settings.maxDuration ??
          DEFAULT_PIPELINE_CONFIG.maxClipDuration,
        maxClips: project.settings.maxClips ?? DEFAULT_PIPELINE_CONFIG.maxClips,
        minClipDuration:
          project.settings.minDuration ??
          DEFAULT_PIPELINE_CONFIG.minClipDuration,
      }),
    };
  }

  private async getProject(projectId: string): Promise<IClipProject> {
    const response = await firstValueFrom(
      this.httpService.get(
        `${this.configService.API_URL}/v1/clip-projects/${projectId}`,
        {
          headers: {
            Authorization: `Bearer ${this.configService.API_KEY}`,
          },
        },
      ),
    );
    return response.data?.data || response.data;
  }

  private async updateProject(
    projectId: string,
    update: Record<string, unknown>,
  ): Promise<void> {
    await firstValueFrom(
      this.httpService.patch(
        `${this.configService.API_URL}/v1/clip-projects/${projectId}`,
        update,
        {
          headers: {
            Authorization: `Bearer ${this.configService.API_KEY}`,
            'Content-Type': 'application/json',
          },
        },
      ),
    );
  }

  private async createClipResults(
    project: IClipProject,
    highlights: IHighlight[],
  ): Promise<Array<{ _id: string }>> {
    const results: Array<{ _id: string }> = [];

    for (let i = 0; i < highlights.length; i++) {
      const highlight = highlights[i];

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.configService.API_URL}/v1/clip-results`,
          {
            clipType: highlight.clip_type,
            duration: highlight.end_time - highlight.start_time,
            endTime: highlight.end_time,
            index: i,
            organization: project.organization,
            project: project._id,
            startTime: highlight.start_time,
            summary: highlight.summary,
            tags: highlight.tags,
            title: highlight.title,
            user: project.user,
            viralityScore: highlight.virality_score,
          },
          {
            headers: {
              Authorization: `Bearer ${this.configService.API_KEY}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      results.push(response.data?.data || response.data);
    }

    return results;
  }

  private async updateClipResult(
    clipResultId: string,
    update: Record<string, unknown>,
  ): Promise<void> {
    if (!clipResultId) {
      return;
    }

    await firstValueFrom(
      this.httpService.patch(
        `${this.configService.API_URL}/v1/clip-results/${clipResultId}`,
        update,
        {
          headers: {
            Authorization: `Bearer ${this.configService.API_KEY}`,
            'Content-Type': 'application/json',
          },
        },
      ),
    );
  }

  private generateClipSrt(
    segments: Array<{ start: number; end: number; text: string }>,
    clipStart: number,
    clipEnd: number,
  ): string {
    const clipSegments = segments.filter(
      (seg) => seg.start >= clipStart && seg.end <= clipEnd,
    );

    return clipSegments
      .map((seg, idx) => {
        const relativeStart = seg.start - clipStart;
        const relativeEnd = seg.end - clipStart;
        return `${idx + 1}\n${this.formatSrtTimestamp(relativeStart)} --> ${this.formatSrtTimestamp(relativeEnd)}\n${seg.text.trim()}`;
      })
      .join('\n\n');
  }

  private formatSrtTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.round((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }
}

/**
 * Clip Analyze Processor
 *
 * BullMQ worker that runs the cheap analysis pipeline only:
 * 1. Download audio from YouTube via files microservice
 * 2. Transcribe via WhisperService (Replicate)
 * 3. Detect highlights via OpenRouter LLM (GPT-4o)
 * 4. Filter by minViralityScore
 * 5. Save highlights to ClipProject (status: 'analyzed')
 *
 * Does NOT generate avatar videos — that's the clip-factory queue.
 */

import { randomUUID } from 'node:crypto';
import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { IHighlight } from '@api/collections/clip-projects/schemas/clip-project.schema';
import { ConfigService } from '@api/config/config.service';
import type { ClipAnalyzeJobData } from '@api/queues/clip-analyze/clip-analyze.constants';
import {
  CLIP_ANALYZE_CONCURRENCY,
  CLIP_ANALYZE_QUEUE,
} from '@api/queues/clip-analyze/clip-analyze.constants';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Processor, WorkerHost } from '@nestjs/bullmq';

import type { Job } from 'bullmq';
import { firstValueFrom } from 'rxjs';

/** System prompt for highlight detection. */
const HIGHLIGHT_SYSTEM_PROMPT = `You are a viral content analyst. Given a video transcript with timestamps, identify the best short-form clips for TikTok, Reels, and YouTube Shorts.

For each clip return a JSON array of objects with these fields:
- start_time: number (seconds from start)
- end_time: number (seconds from start)
- title: string (catchy hook, under 60 characters)
- summary: string (why this clip is compelling, 1-2 sentences)
- virality_score: number (1-100, how likely to go viral)
- tags: string[] (relevant hashtag topics)
- clip_type: string (one of: hook, story, tutorial, reaction, quote, controversial, educational)

Prioritize:
- Strong opening hooks that grab attention in the first 3 seconds
- Complete narrative arcs with beginning, middle, and end
- Emotional peaks (laughter, surprise, anger, inspiration)
- Controversial or surprising statements that provoke engagement
- Educational "aha" moments with clear takeaways
- Quotable one-liners or memorable phrases

Rules:
- Each clip must be a self-contained segment that makes sense without context
- Clips should not overlap
- Prefer clips with strong opening hooks
- Return ONLY valid JSON array, no markdown or explanation`;

interface HighlightResult {
  start_time: number;
  end_time: number;
  title: string;
  summary: string;
  virality_score: number;
  tags: string[];
  clip_type: string;
}

@Processor(CLIP_ANALYZE_QUEUE, {
  concurrency: CLIP_ANALYZE_CONCURRENCY,
  limiter: { duration: 60_000, max: 5 },
})
export class ClipAnalyzeProcessor extends WorkerHost {
  private readonly logContext = 'ClipAnalyzeProcessor';
  private readonly openRouterUrl =
    'https://openrouter.ai/api/v1/chat/completions';

  constructor(
    private readonly logger: LoggerService,
    private readonly clipProjectsService: ClipProjectsService,
    private readonly whisperService: WhisperService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<ClipAnalyzeJobData>): Promise<void> {
    const { data } = job;
    const { projectId } = data;

    this.logger.log(`${this.logContext} starting analysis`, {
      jobId: job.id,
      projectId,
      youtubeUrl: data.youtubeUrl,
    });

    try {
      // Stage 1: Download audio via files microservice
      await this.updateProject(projectId, {
        progress: 5,
        status: 'analyzing',
      });

      const audioUrl = await this.downloadAudio(
        data.youtubeUrl,
        data.orgId,
        data.userId,
      );
      await this.updateProject(projectId, { progress: 15 });

      this.logger.log(`${this.logContext} audio downloaded`, {
        audioUrl,
        projectId,
      });

      // Stage 2: Transcribe
      const transcription = await this.whisperService.transcribeUrl(
        audioUrl,
        data.language,
      );

      await this.updateProject(projectId, {
        progress: 45,
        transcriptSegments: transcription.segments,
        transcriptSrt: transcription.srt,
        transcriptText: transcription.text,
      });

      this.logger.log(`${this.logContext} transcription complete`, {
        duration: transcription.duration,
        projectId,
        segments: transcription.segments.length,
      });

      // Stage 3: Detect highlights via LLM
      const rawHighlights = await this.detectHighlights(
        transcription.text,
        transcription.segments,
        data.maxClips,
      );

      // Stage 4: Filter by virality score and assign IDs
      const highlights: IHighlight[] = rawHighlights
        .filter((h) => h.virality_score >= data.minViralityScore)
        .map((h) => ({
          ...h,
          id: randomUUID(),
        }));

      // Stage 5: Save highlights — pipeline complete (no generation)
      await this.updateProject(projectId, {
        highlights,
        progress: 100,
        status: 'analyzed',
      });

      this.logger.log(`${this.logContext} analysis complete`, {
        highlightsCount: highlights.length,
        projectId,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown analysis error';

      this.logger.error(`${this.logContext} analysis failed`, error);

      await this.updateProject(projectId, {
        error: errorMessage,
        status: 'failed',
      }).catch((updateErr: unknown) => {
        this.logger.error(
          `${this.logContext} failed to update project status`,
          updateErr,
        );
      });

      throw error;
    }
  }

  /**
   * Download audio from a YouTube URL via the files microservice.
   */
  private async downloadAudio(
    youtubeUrl: string,
    organizationId: string,
    userId: string,
  ): Promise<string> {
    const filesUrl =
      this.configService.get('GENFEEDAI_MICROSERVICES_FILES_URL') ||
      'http://files.genfeed.ai:3000';

    const response = await firstValueFrom(
      this.httpService.post(
        `${filesUrl}/v1/files/process/video`,
        {
          organizationId,
          params: { inputPath: youtubeUrl },
          type: 'video-to-audio',
          userId,
        },
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const jobId = response.data?.jobId || response.data?.data?.jobId;

    if (!jobId) {
      throw new Error(
        'Files microservice did not return a jobId for audio extraction',
      );
    }

    return this.waitForAudioJob(filesUrl, jobId);
  }

  /**
   * Poll the files microservice until the audio extraction job completes.
   */
  private async waitForAudioJob(
    filesUrl: string,
    jobId: string,
    timeoutMs = 120_000,
  ): Promise<string> {
    const pollInterval = 2_000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      const response = await firstValueFrom(
        this.httpService.get(`${filesUrl}/v1/files/job/${jobId}`),
      );

      const status = response.data?.status || response.data?.data?.status;

      if (status === 'completed' || status === 'COMPLETED') {
        const result =
          response.data?.result || response.data?.data?.result || response.data;
        return result.outputUrl || result.url;
      }

      if (status === 'failed' || status === 'FAILED') {
        throw new Error(`Audio extraction job ${jobId} failed`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `Audio extraction job ${jobId} timed out after ${timeoutMs}ms`,
    );
  }

  /**
   * Detect viral highlights from transcript text using OpenRouter LLM.
   */
  private async detectHighlights(
    transcriptText: string,
    segments: Array<{ start: number; end: number; text: string }>,
    maxClips: number,
  ): Promise<HighlightResult[]> {
    const formattedTranscript = segments
      .map((seg) => {
        const mins = Math.floor(seg.start / 60);
        const secs = Math.floor(seg.start % 60);
        const endMins = Math.floor(seg.end / 60);
        const endSecs = Math.floor(seg.end % 60);
        return `[${mins}:${String(secs).padStart(2, '0')} - ${endMins}:${String(endSecs).padStart(2, '0')}] ${seg.text}`;
      })
      .join('\n');

    const userPrompt = `Analyze this transcript and find the ${maxClips} best clips between 15-90 seconds long.

Transcript with timestamps:
${formattedTranscript}

Return a JSON array of clip objects sorted by virality_score descending.`;

    const openRouterApiKey = this.configService.get('OPENROUTER_API_KEY') || '';

    const response = await firstValueFrom(
      this.httpService.post(
        this.openRouterUrl,
        {
          max_tokens: 4096,
          messages: [
            { content: HIGHLIGHT_SYSTEM_PROMPT, role: 'system' },
            { content: userPrompt, role: 'user' },
          ],
          model: 'openai/gpt-4o',
          stream: false,
          temperature: 0.3,
        },
        {
          headers: {
            Authorization: `Bearer ${openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://genfeed.ai',
            'X-Title': 'GenFeed AI Clip Factory',
          },
          timeout: 60_000,
        },
      ),
    );

    const content = response.data?.choices?.[0]?.message?.content || '';

    return this.parseHighlights(content, maxClips);
  }

  /**
   * Parse LLM JSON response into validated highlights.
   */
  private parseHighlights(
    content: string,
    maxClips: number,
  ): HighlightResult[] {
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.error(
          `${this.logContext} no JSON array found in LLM response`,
        );
        return [];
      }

      const parsed: HighlightResult[] = JSON.parse(jsonMatch[0]);

      return parsed
        .filter((h) => {
          const duration = h.end_time - h.start_time;
          return (
            duration >= 15 &&
            duration <= 90 &&
            h.start_time >= 0 &&
            h.end_time > h.start_time &&
            h.virality_score >= 1 &&
            h.virality_score <= 100
          );
        })
        .sort((a, b) => b.virality_score - a.virality_score)
        .slice(0, maxClips);
    } catch (error: unknown) {
      this.logger.error(`${this.logContext} failed to parse highlights`, error);
      return [];
    }
  }

  /**
   * Update clip project fields.
   */
  private async updateProject(
    projectId: string,
    update: Record<string, unknown>,
  ): Promise<void> {
    await this.clipProjectsService.patch(projectId, update);
  }
}

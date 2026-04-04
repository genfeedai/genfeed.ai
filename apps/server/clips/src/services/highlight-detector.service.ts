import { ConfigService } from '@clips/config/config.service';
import type { ITranscriptSegment } from '@clips/interfaces/clip-project.interface';
import type {
  IHighlight,
  IHighlightDetectionResult,
} from '@clips/interfaces/highlight.interface';
import type { IPipelineConfig } from '@clips/interfaces/pipeline-config.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const SYSTEM_PROMPT = `You are a viral content analyst. Given a video transcript with timestamps, identify the best short-form clips for TikTok, Reels, and YouTube Shorts.

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

@Injectable()
export class HighlightDetectorService {
  private readonly constructorName = String(this.constructor.name);
  private readonly openRouterUrl =
    'https://openrouter.ai/api/v1/chat/completions';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async detectHighlights(
    _transcriptText: string,
    segments: ITranscriptSegment[],
    config: IPipelineConfig,
  ): Promise<IHighlightDetectionResult> {
    const methodName = `${this.constructorName}.detectHighlights`;
    this.logger.log(
      `${methodName} Analyzing transcript (${segments.length} segments) with ${config.llmModel}`,
    );

    const formattedTranscript = this.formatTranscriptForLLM(segments);

    const userPrompt = `Analyze this transcript and find the ${config.maxClips} best clips between ${config.minClipDuration}-${config.maxClipDuration} seconds long.

Transcript with timestamps:
${formattedTranscript}

Return a JSON array of clip objects sorted by virality_score descending.`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          this.openRouterUrl,
          {
            max_tokens: 4096,
            messages: [
              { content: SYSTEM_PROMPT, role: 'system' },
              { content: userPrompt, role: 'user' },
            ],
            model: config.llmModel,
            stream: false,
            temperature: 0.3,
          },
          {
            headers: {
              Authorization: `Bearer ${this.configService.OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://genfeed.ai',
              'X-Title': 'Genfeed AI Clipper',
            },
            timeout: 60_000,
          },
        ),
      );

      const content = response.data?.choices?.[0]?.message?.content || '';
      const tokensUsed = response.data?.usage?.total_tokens || 0;

      const highlights = this.parseHighlights(content, config);

      this.logger.log(
        `${methodName} Detected ${highlights.length} highlights (${tokensUsed} tokens used)`,
      );

      return {
        highlights,
        model: config.llmModel,
        tokensUsed,
      };
    } catch (error: unknown) {
      this.logger.error(`${methodName} Failed`, error);
      throw error;
    }
  }

  private formatTranscriptForLLM(segments: ITranscriptSegment[]): string {
    return segments
      .map(
        (seg) =>
          `[${this.formatTimestamp(seg.start)} - ${this.formatTimestamp(seg.end)}] ${seg.text}`,
      )
      .join('\n');
  }

  private formatTimestamp(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private parseHighlights(
    content: string,
    config: IPipelineConfig,
  ): IHighlight[] {
    try {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.error(
          `${this.constructorName}.parseHighlights No JSON array found in response`,
        );
        return [];
      }

      const parsed: IHighlight[] = JSON.parse(jsonMatch[0]);

      return parsed
        .filter((h) => {
          const duration = h.end_time - h.start_time;
          return (
            duration >= config.minClipDuration &&
            duration <= config.maxClipDuration &&
            h.start_time >= 0 &&
            h.end_time > h.start_time
          );
        })
        .sort((a, b) => b.virality_score - a.virality_score)
        .slice(0, config.maxClips);
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName}.parseHighlights Failed to parse LLM response`,
        error,
      );
      return [];
    }
  }
}

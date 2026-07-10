/**
 * Clip Highlight Detector
 *
 * Shared highlight-detection step for the clip queue processors
 * (clip-analyze + clip-factory). Owns the highlight prompt, the OpenRouter
 * LLM call, and the JSON parse/validation/fallback behavior so the two
 * processors cannot drift.
 */

import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
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

/** A single highlight as returned by the LLM. */
export interface HighlightResult {
  start_time: number;
  end_time: number;
  title: string;
  summary: string;
  virality_score: number;
  tags: string[];
  clip_type: string;
}

/** Transcript segment produced by transcription (whisper). */
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

@Injectable()
export class ClipHighlightDetector {
  private readonly logContext = 'ClipHighlightDetector';
  private readonly openRouterUrl =
    'https://openrouter.ai/api/v1/chat/completions';

  constructor(
    private readonly logger: LoggerService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Detect viral highlights from transcript text using OpenRouter LLM.
   */
  async detectHighlights(
    // Full transcript text is passed for parity with the transcription output
    // and future use; only the timestamped segments drive the prompt today.
    _transcriptText: string,
    segments: TranscriptSegment[],
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
}

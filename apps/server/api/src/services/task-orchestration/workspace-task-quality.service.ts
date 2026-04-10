import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type WorkspaceQualityGate = 'pass' | 'needs_revision' | 'fail';

export interface WorkspaceTaskQualityAssessmentResult {
  dimensions: Array<{
    label: string;
    notes?: string;
    score: number;
  }>;
  gate: WorkspaceQualityGate;
  repairLoopUsed: boolean;
  rubricVersion: string;
  score: number;
  suggestedFixes: string[];
  summary?: string;
  winnerSummary?: string;
}

export interface WorkspaceTaskQualityAssessmentInput {
  outputType?: string;
  platforms?: string[];
  repairLoopUsed?: boolean;
  request: string;
  summaries: string[];
}

@Injectable()
export class WorkspaceTaskQualityService {
  private readonly rubricVersion = 'founder-gtm-v1';
  private readonly logContext = 'WorkspaceTaskQualityService';

  constructor(
    private readonly llmDispatcherService: LlmDispatcherService,
    private readonly logger: LoggerService,
  ) {}

  async assess(
    input: WorkspaceTaskQualityAssessmentInput,
    organizationId?: string,
  ): Promise<WorkspaceTaskQualityAssessmentResult> {
    try {
      const response = await this.llmDispatcherService.chatCompletion(
        {
          max_tokens: 900,
          messages: [
            {
              content: this.buildSystemPrompt(),
              role: 'system',
            },
            {
              content: this.buildUserPrompt(input),
              role: 'user',
            },
          ],
          model: 'openai/gpt-4o-mini',
          temperature: 0.1,
        },
        organizationId,
      );

      const raw = response.choices?.[0]?.message?.content;
      if (!raw || typeof raw !== 'string') {
        return this.buildFallbackAssessment(input);
      }

      return this.parseAssessment(raw, input);
    } catch (error: unknown) {
      this.logger.warn(`${this.logContext}: quality assessment failed`, {
        error,
      });
      return this.buildFallbackAssessment(input);
    }
  }

  private buildSystemPrompt(): string {
    return [
      'You evaluate founder-led GTM content quality for Genfeed.',
      'Return strict JSON with keys: score, gate, summary, winnerSummary, suggestedFixes, dimensions.',
      'Score must be 0..1.',
      'gate must be one of: pass, needs_revision, fail.',
      'dimensions must be an array of objects with keys: label, score, notes.',
      'Judge for founder-led technical GTM quality: sharpness, clarity, specificity, novelty, usefulness, voice fit, and platform fit.',
      'Prefer practical, opinionated, concrete writing. Penalize fluff, vague AI hype, and generic marketing language.',
      'Use this dimension set when relevant: voice_match, clarity, specificity, novelty, usefulness, hook_strength, platform_fit.',
      'Do not wrap JSON in markdown fences.',
    ].join('\n');
  }

  private buildUserPrompt(input: WorkspaceTaskQualityAssessmentInput): string {
    return JSON.stringify(
      {
        outputType: input.outputType ?? 'unknown',
        platforms: input.platforms ?? [],
        repairLoopUsed: input.repairLoopUsed ?? false,
        request: input.request,
        summaries: input.summaries,
      },
      null,
      2,
    );
  }

  private parseAssessment(
    raw: string,
    input: WorkspaceTaskQualityAssessmentInput,
  ): WorkspaceTaskQualityAssessmentResult {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      const dimensions = Array.isArray(parsed.dimensions)
        ? parsed.dimensions
            .filter(
              (dimension): dimension is Record<string, unknown> =>
                typeof dimension === 'object' &&
                dimension !== null &&
                !Array.isArray(dimension),
            )
            .map((dimension) => ({
              label:
                typeof dimension.label === 'string'
                  ? dimension.label
                  : 'quality',
              notes:
                typeof dimension.notes === 'string'
                  ? dimension.notes
                  : undefined,
              score: this.clampScore(dimension.score),
            }))
        : [];

      const assessment: WorkspaceTaskQualityAssessmentResult = {
        dimensions,
        gate: this.normalizeGate(parsed.gate),
        repairLoopUsed: input.repairLoopUsed ?? false,
        rubricVersion: this.rubricVersion,
        score: this.clampScore(parsed.score),
        suggestedFixes: Array.isArray(parsed.suggestedFixes)
          ? parsed.suggestedFixes.filter(
              (fix): fix is string =>
                typeof fix === 'string' && fix.trim().length > 0,
            )
          : [],
        summary:
          typeof parsed.summary === 'string' ? parsed.summary : undefined,
        winnerSummary:
          typeof parsed.winnerSummary === 'string'
            ? parsed.winnerSummary
            : input.summaries[0],
      };

      if (assessment.dimensions.length === 0) {
        return this.buildFallbackAssessment(input);
      }

      return assessment;
    } catch {
      return this.buildFallbackAssessment(input);
    }
  }

  private buildFallbackAssessment(
    input: WorkspaceTaskQualityAssessmentInput,
  ): WorkspaceTaskQualityAssessmentResult {
    const text = input.summaries.join(' ').trim();
    const scoreBase =
      text.length >= 180 ? 0.76 : text.length >= 80 ? 0.62 : 0.42;
    const outputType = input.outputType ?? 'content';
    const hookScore =
      outputType === 'post' || outputType === 'newsletter' ? 0.7 : 0.6;
    const platformFit =
      (input.platforms?.some((platform) =>
        ['x', 'twitter', 'linkedin', 'beehiiv'].includes(
          platform.toLowerCase(),
        ),
      ) ?? false)
        ? 0.78
        : 0.64;
    const score = Math.min(
      1,
      Number(((scoreBase + hookScore + platformFit) / 3).toFixed(2)),
    );

    return {
      dimensions: [
        {
          label: 'clarity',
          notes: 'Fallback score based on output length and structure.',
          score: scoreBase,
        },
        {
          label: 'hook_strength',
          notes: 'Fallback score based on GTM-oriented output type.',
          score: hookScore,
        },
        {
          label: 'platform_fit',
          notes: 'Fallback score based on known platform intent.',
          score: platformFit,
        },
      ],
      gate: score >= 0.78 ? 'pass' : score >= 0.58 ? 'needs_revision' : 'fail',
      repairLoopUsed: input.repairLoopUsed ?? false,
      rubricVersion: this.rubricVersion,
      score,
      suggestedFixes:
        score >= 0.78
          ? ['Run human editorial review before publish.']
          : [
              'Tighten the hook and lead with a stronger claim.',
              'Add a sharper proof point or concrete example.',
              'Remove generic marketing phrasing before review.',
            ],
      summary:
        score >= 0.78
          ? 'System quality gate passed with strong baseline clarity.'
          : 'System quality gate flagged this draft for editorial tightening.',
      winnerSummary: input.summaries[0],
    };
  }

  private normalizeGate(value: unknown): WorkspaceQualityGate {
    if (value === 'pass' || value === 'needs_revision' || value === 'fail') {
      return value;
    }

    return 'needs_revision';
  }

  private clampScore(value: unknown): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 0.5;
    }

    return Math.max(0, Math.min(1, Number(value.toFixed(2))));
  }
}

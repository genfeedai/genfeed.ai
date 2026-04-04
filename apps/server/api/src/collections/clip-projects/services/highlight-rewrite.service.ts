import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { ClipProjectDocument } from '@api/collections/clip-projects/schemas/clip-project.schema';
import {
  getDefaultModel,
  OpenRouterModelTier,
} from '@api/services/integrations/openrouter/dto/openrouter.dto';
import { OpenRouterService } from '@api/services/integrations/openrouter/services/openrouter.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

@Injectable()
export class HighlightRewriteService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly openRouterService: OpenRouterService,
    private readonly clipProjectsService: ClipProjectsService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Build the viral-rewrite system prompt for a given platform + tone.
   */
  buildPrompt(originalScript: string, platform: string, tone: string): string {
    return `You are a viral content writer specializing in short-form video scripts.

Rewrite the following script to be more viral for ${platform}.

Rules:
- Start with a hook in the first 3 words that grabs attention immediately
- Use short punchy sentences (max 15 words each)
- Add pattern interrupts naturally ("Wait—", "Here's the thing:", "Nobody talks about this:")
- Keep the core message and key facts intact
- Remove filler words, passive voice, and hedging language
- End with a strong CTA or cliffhanger
- Target 30-60 seconds of spoken content (~75-150 words)
- Tone: ${tone}

Original script:
${originalScript}

Return ONLY the rewritten script. No explanation, no markdown, just the script text.`;
  }

  /**
   * Rewrite a highlight script using LLM and persist to DB.
   */
  async rewrite(
    projectId: string,
    highlightId: string,
    platform: string,
    tone: string,
  ): Promise<{ rewrittenScript: string; originalScript: string }> {
    const project: ClipProjectDocument | null =
      await this.clipProjectsService.findOne({
        _id: projectId,
        isDeleted: false,
      });

    if (!project) {
      throw new NotFoundException(`ClipProject ${projectId} not found`);
    }

    const highlights = project.highlights || [];
    const highlight = highlights.find((h) => h.id === highlightId);

    if (!highlight) {
      throw new NotFoundException(
        `Highlight ${highlightId} not found in project ${projectId}`,
      );
    }

    const originalScript = highlight.summary || '';

    if (!originalScript.trim()) {
      throw new NotFoundException(
        `Highlight ${highlightId} has no script to rewrite`,
      );
    }

    const prompt = this.buildPrompt(originalScript, platform, tone);

    let rewrittenScript: string;

    try {
      const response = await this.openRouterService.chatCompletion({
        max_tokens: 500,
        messages: [{ content: prompt, role: 'user' }],
        model: getDefaultModel(OpenRouterModelTier.FAST),
        temperature: 0.8,
      });

      rewrittenScript = response.choices?.[0]?.message?.content?.trim() || '';

      if (!rewrittenScript) {
        throw new Error('Empty response from LLM');
      }
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName}.rewrite LLM call failed`,
        { error, highlightId, projectId },
      );
      throw new InternalServerErrorException(
        'Failed to rewrite script. Please try again.',
      );
    }

    // Persist the rewritten script to the highlight in DB
    const updatedHighlights = highlights.map((h) =>
      h.id === highlightId ? { ...h, summary: rewrittenScript } : h,
    );

    await this.clipProjectsService.patch(projectId, {
      highlights: updatedHighlights,
    });

    return { originalScript, rewrittenScript };
  }
}

import { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AgentContextAssemblyService } from '@api/services/agent-context-assembly/agent-context-assembly.service';
import { BRAND_CONTEXT_CHARACTER_BUDGET } from '@api/services/agent-context-assembly/brand-context-budget.util';
import { PlanPerformanceContextService } from '@api/services/content-engine/plan-performance-context.service';
import { HarnessGenerationService } from '@api/services/harness/harness-generation.service';
import { LlmDispatcherService } from '@api/services/integrations/llm/llm-dispatcher.service';
import {
  STUDIO_MEDIA_PROPOSALS_SCHEMA_NAME,
  STUDIO_PROPOSAL_ASPECT_RATIOS,
  STUDIO_PROPOSAL_DEFAULT_COUNT,
  STUDIO_STORYBOARD_PROPOSALS_SCHEMA_NAME,
  type StudioProposalSurface,
  type StudioProposalsResult,
  studioMediaProposalGenerationSchema,
  studioStoryboardProposalGenerationSchema,
} from '@genfeedai/contracts/api-types/contracts';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import type { ContentKind } from '@genfeedai/harness';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export interface StudioProposalsRequest {
  brandId: string;
  count?: number;
  organizationId: string;
  surface: StudioProposalSurface;
  userId: string;
}

const STUDIO_PROPOSALS_BRAND_CONTEXT_UNAVAILABLE =
  'Brand context could not be loaded for these proposals, so nothing was drafted. Try again.';

const SURFACE_CONTENT_KIND: Record<StudioProposalSurface, ContentKind> = {
  image: 'image',
  storyboard: 'video-script',
  video: 'video',
};

const SURFACE_INSTRUCTIONS: Record<StudioProposalSurface, string> = {
  image: `Propose still images. Each prompt is a complete, model-ready image prompt (subject, setting, composition, lighting, style) of 40-120 words. Pick the aspect ratio that suits where the brand posts (${STUDIO_PROPOSAL_ASPECT_RATIOS.join(', ')}).`,
  storyboard:
    'Propose short videos as storyboards. Each brief is 2-4 sentences on the story and the outcome for the viewer. Each shot describes what is on screen; the shots add up to 15-60 seconds.',
  video: `Propose short videos. Each prompt is a complete, model-ready video prompt (subject, action, camera movement, setting, style) of 40-120 words for a 5-10 second clip. Pick the aspect ratio that suits where the brand posts (${STUDIO_PROPOSAL_ASPECT_RATIOS.join(', ')}).`,
};

/**
 * Agent-written Studio drafts (#7341). Only a brand with an approved Brand OS
 * gets proposals; every other brand keeps today's empty composer.
 */
@Injectable()
export class StudioProposalsService {
  constructor(
    private readonly agentContextAssemblyService: AgentContextAssemblyService,
    private readonly brandOsRevisionsService: BrandOsRevisionsService,
    private readonly llmDispatcherService: LlmDispatcherService,
    private readonly planPerformanceContextService: PlanPerformanceContextService,
    private readonly harnessGenerationService: HarnessGenerationService,
    private readonly logger: LoggerService,
  ) {}

  async propose(
    request: StudioProposalsRequest,
  ): Promise<StudioProposalsResult> {
    const { brandId, organizationId, surface, userId } = request;
    const approved = await this.brandOsRevisionsService.findApproved(
      organizationId,
      brandId,
    );
    if (!approved) {
      return surface === 'storyboard'
        ? { isBrandApproved: false, proposals: [], surface }
        : { isBrandApproved: false, proposals: [], surface };
    }

    const harnessBrief = await this.resolveHarnessBrief(request);
    const [context, performance] = await Promise.all([
      this.agentContextAssemblyService.assembleContext({
        brandId,
        layers: { performancePatterns: true },
        organizationId,
        query: `${surface} content ideas`,
        userId,
      }),
      this.planPerformanceContextService.build({ brandId, organizationId }),
    ]);
    if (!context) throw new NotFoundException('Brand');

    const count = request.count ?? STUDIO_PROPOSAL_DEFAULT_COUNT;
    const systemPrompt = [
      this.agentContextAssemblyService.buildSystemPrompt(
        `You are ${context.brandName}'s creative director. You write ready-to-generate drafts for the brand's studio, so the team can create without writing a prompt. Stay on brand: voice, audience, visual identity and what already performs.`,
        context,
      ),
      harnessBrief,
    ].join('\n\n');
    const userPrompt = [
      `Write ${count} distinct proposals. ${SURFACE_INSTRUCTIONS[surface]}`,
      'Give each one a short title and a one-sentence "why" that names the brand signal or performance pattern it builds on.',
      performance.section,
    ]
      .filter(Boolean)
      .join('\n\n');
    const messages = [
      { content: systemPrompt, role: 'system' as const },
      { content: userPrompt, role: 'user' as const },
    ];

    if (surface === 'storyboard') {
      const { proposals } = await this.llmDispatcherService.completeStructured(
        {
          messages,
          model: LLM_DEFAULTS.creativeAgent,
          schema: studioStoryboardProposalGenerationSchema,
          schemaName: STUDIO_STORYBOARD_PROPOSALS_SCHEMA_NAME,
          temperature: 0.8,
        },
        organizationId,
      );
      return { isBrandApproved: true, proposals, surface };
    }

    const { proposals } = await this.llmDispatcherService.completeStructured(
      {
        messages,
        model: LLM_DEFAULTS.creativeAgent,
        schema: studioMediaProposalGenerationSchema,
        schemaName: STUDIO_MEDIA_PROPOSALS_SCHEMA_NAME,
        temperature: 0.8,
      },
      organizationId,
    );
    return { isBrandApproved: true, proposals, surface };
  }

  /**
   * Proposals are copy the team generates from, so they are written against
   * the composed harness brief. Without it the request fails before any model
   * call instead of drafting from the generic brand context alone.
   */
  private async resolveHarnessBrief({
    brandId,
    organizationId,
    surface,
    userId,
  }: StudioProposalsRequest): Promise<string> {
    const brief = await this.harnessGenerationService.resolveBrief({
      brandId,
      contentType: SURFACE_CONTENT_KIND[surface],
      includeContentMemory: true,
      organizationId,
      topic: `${surface} content ideas`,
      userId,
    });
    const formatted = this.harnessGenerationService.formatBrief(brief).trim();
    if (
      !brief ||
      !formatted ||
      formatted.length > BRAND_CONTEXT_CHARACTER_BUDGET
    ) {
      this.logger.warn(`${this.constructor.name} harness brief unavailable`, {
        brandId,
        organizationId,
        surface,
      });
      throw new ServiceUnavailableException(
        STUDIO_PROPOSALS_BRAND_CONTEXT_UNAVAILABLE,
      );
    }
    return formatted;
  }
}

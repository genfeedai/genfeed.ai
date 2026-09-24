import { BrandInterviewService } from '@api/collections/brands/brand-interview/services/brand-interview.service';
import { resolveOptionalProvider } from '@api/helpers/utils/module-ref/resolve-optional-provider.util';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import type {
  AgentToolResult,
  AgentUiAction,
} from '@genfeedai/contracts/interfaces';
import { Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

const BRAND_INTERVIEW_DEPLOY_GATE =
  'Brand interview is deploy-gated: BrandInterviewService is not registered in this API process. This is not a plan or credit gate.';

/**
 * Brand context interview tools (`start_brand_interview`,
 * `submit_brand_interview_answer`, `skip_brand_interview_question`,
 * `get_brand_completeness`). Extracted from AgentToolExecutorService per #519.
 */
const BRAND_INTERVIEW_TOOLS = [
  'start_brand_interview',
  'submit_brand_interview_answer',
  'skip_brand_interview_question',
  'get_brand_completeness',
] as const;

type BrandInterviewToolName = (typeof BRAND_INTERVIEW_TOOLS)[number];

@Injectable()
export class AgentBrandInterviewToolHandler {
  constructor(
    @Optional()
    private readonly brandInterviewService?: BrandInterviewService,
    @Optional()
    private readonly moduleRef?: ModuleRef,
  ) {}

  /**
   * Constructor injection is empty when the orchestrator module cycle resolves
   * this handler before BrandInterviewModule. The service is still registered
   * on the API, so resolve it from the container at call time.
   */
  private resolveBrandInterviewService(): BrandInterviewService | undefined {
    return (
      this.brandInterviewService ??
      resolveOptionalProvider(this.moduleRef, BrandInterviewService)
    );
  }

  private brandInterviewUnavailable(): AgentToolResult {
    return {
      creditsUsed: 0,
      error: BRAND_INTERVIEW_DEPLOY_GATE,
      success: false,
    };
  }

  /** Single dispatch entry so the executor route table stays flat. */
  execute(
    toolName: BrandInterviewToolName,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    switch (toolName) {
      case 'start_brand_interview':
        return this.startBrandInterview(params, ctx);
      case 'submit_brand_interview_answer':
        return this.submitBrandInterviewAnswer(params, ctx);
      case 'skip_brand_interview_question':
        return this.skipBrandInterviewQuestion(params, ctx);
      case 'get_brand_completeness':
        return this.getBrandCompleteness(params, ctx);
    }
  }

  async startBrandInterview(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brandInterviewService = this.resolveBrandInterviewService();
    if (!brandInterviewService) {
      return this.brandInterviewUnavailable();
    }

    const brandId = readOptionalString(params.brandId);
    if (!brandId) {
      return {
        creditsUsed: 0,
        error: 'start_brand_interview requires a brandId.',
        success: false,
      };
    }

    const result = await brandInterviewService.start(
      brandId,
      ctx.organizationId,
      ctx.userId,
    );

    const nextActions: AgentUiAction[] =
      result.currentQuestion === null
        ? [
            {
              data: {
                completenessScore: result.completenessScore,
                interviewId: result.interviewId,
              },
              description:
                'Your brand context is already complete — no more questions needed.',
              id: `brand-interview-complete-${brandId}`,
              title: 'Brand Context Complete',
              type: 'brand_interview_complete_card',
            },
          ]
        : [];

    return {
      creditsUsed: result.creditsCharged,
      data: {
        brandId: result.brandId,
        completenessScore: result.completenessScore,
        currentQuestion: result.currentQuestion,
        interviewId: result.interviewId,
        progress: result.progress,
        status: result.status,
      },
      nextActions,
      success: true,
    };
  }

  async submitBrandInterviewAnswer(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brandInterviewService = this.resolveBrandInterviewService();
    if (!brandInterviewService) {
      return this.brandInterviewUnavailable();
    }

    const interviewId = readOptionalString(params.interviewId);
    const answer = readOptionalString(params.answer);

    if (!interviewId || !answer) {
      return {
        creditsUsed: 0,
        error: 'submit_brand_interview_answer requires interviewId and answer.',
        success: false,
      };
    }

    const result = await brandInterviewService.submitAnswer(
      interviewId,
      ctx.organizationId,
      ctx.userId,
      answer,
    );

    const nextActions: AgentUiAction[] = result.isComplete
      ? [
          {
            data: {
              completenessScore: result.completenessScore,
              interviewId: result.interviewId,
            },
            description:
              'All brand context questions have been answered. Your brand profile is now more complete.',
            id: `brand-interview-complete-${result.interviewId}`,
            title: 'Brand Context Complete',
            type: 'brand_interview_complete_card',
          },
        ]
      : [];

    return {
      creditsUsed: 0,
      data: {
        completenessScore: result.completenessScore,
        interviewId: result.interviewId,
        isComplete: result.isComplete,
        nextQuestion: result.nextQuestion,
        progress: result.progress,
        status: result.status,
      },
      nextActions,
      success: true,
    };
  }

  async skipBrandInterviewQuestion(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brandInterviewService = this.resolveBrandInterviewService();
    if (!brandInterviewService) {
      return this.brandInterviewUnavailable();
    }

    const interviewId = readOptionalString(params.interviewId);
    if (!interviewId) {
      return {
        creditsUsed: 0,
        error: 'skip_brand_interview_question requires an interviewId.',
        success: false,
      };
    }

    const result = await brandInterviewService.skipField(
      interviewId,
      ctx.organizationId,
      ctx.userId,
    );

    return {
      creditsUsed: 0,
      data: {
        completenessScore: result.completenessScore,
        interviewId: result.interviewId,
        isComplete: result.isComplete,
        nextQuestion: result.nextQuestion,
        progress: result.progress,
        status: result.status,
      },
      success: true,
    };
  }

  async getBrandCompleteness(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brandInterviewService = this.resolveBrandInterviewService();
    if (!brandInterviewService) {
      return this.brandInterviewUnavailable();
    }

    const brandId = readOptionalString(params.brandId);
    if (!brandId) {
      return {
        creditsUsed: 0,
        error: 'get_brand_completeness requires a brandId.',
        success: false,
      };
    }

    const result = await brandInterviewService.getCompleteness(
      brandId,
      ctx.organizationId,
    );

    return {
      creditsUsed: 0,
      data: {
        incompleteFieldKeys: result.incompleteFieldKeys,
        interviewableGapCount: result.interviewableGapCount,
        overallScore: result.overallScore,
      },
      success: true,
    };
  }
}

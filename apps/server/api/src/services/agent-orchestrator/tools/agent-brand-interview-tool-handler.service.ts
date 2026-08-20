import { BrandInterviewService } from '@api/collections/brands/brand-interview/services/brand-interview.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import type { AgentToolResult, AgentUiAction } from '@genfeedai/interfaces';
import { Injectable, Optional } from '@nestjs/common';

/**
 * Brand context interview tools (`start_brand_interview`,
 * `submit_brand_interview_answer`, `skip_brand_interview_question`,
 * `get_brand_completeness`). Extracted from AgentToolExecutorService per #519.
 */
@Injectable()
export class AgentBrandInterviewToolHandler {
  constructor(
    @Optional()
    private readonly brandInterviewService: BrandInterviewService | undefined,
  ) {}

  async startBrandInterview(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.brandInterviewService) {
      return {
        creditsUsed: 0,
        error: 'Brand interview service is not available in this environment.',
        success: false,
      };
    }

    const brandId = readOptionalString(params.brandId);
    if (!brandId) {
      return {
        creditsUsed: 0,
        error: 'start_brand_interview requires a brandId.',
        success: false,
      };
    }

    const result = await this.brandInterviewService.start(
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
    if (!this.brandInterviewService) {
      return {
        creditsUsed: 0,
        error: 'Brand interview service is not available in this environment.',
        success: false,
      };
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

    const result = await this.brandInterviewService.submitAnswer(
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
    if (!this.brandInterviewService) {
      return {
        creditsUsed: 0,
        error: 'Brand interview service is not available in this environment.',
        success: false,
      };
    }

    const interviewId = readOptionalString(params.interviewId);
    if (!interviewId) {
      return {
        creditsUsed: 0,
        error: 'skip_brand_interview_question requires an interviewId.',
        success: false,
      };
    }

    const result = await this.brandInterviewService.skipField(
      interviewId,
      ctx.organizationId,
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
    if (!this.brandInterviewService) {
      return {
        creditsUsed: 0,
        error: 'Brand interview service is not available in this environment.',
        success: false,
      };
    }

    const brandId = readOptionalString(params.brandId);
    if (!brandId) {
      return {
        creditsUsed: 0,
        error: 'get_brand_completeness requires a brandId.',
        success: false,
      };
    }

    const result = await this.brandInterviewService.getCompleteness(
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

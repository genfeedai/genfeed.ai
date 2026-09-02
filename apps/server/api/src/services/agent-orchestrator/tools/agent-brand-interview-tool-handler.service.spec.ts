import { AgentBrandInterviewToolHandler } from '@api/services/agent-orchestrator/tools/agent-brand-interview-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';

const CTX: ToolExecutionContext = {
  organizationId: 'org-1',
  userId: 'user-1',
};

function createHandler(
  service?: Partial<{
    getCompleteness: ReturnType<typeof vi.fn>;
    skipField: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    submitAnswer: ReturnType<typeof vi.fn>;
  }>,
) {
  const brandInterviewService = {
    getCompleteness: vi.fn().mockResolvedValue({
      incompleteFieldKeys: ['audience'],
      interviewableGapCount: 1,
      overallScore: 40,
    }),
    skipField: vi.fn().mockResolvedValue({
      completenessScore: 45,
      interviewId: 'interview-1',
      isComplete: false,
      nextQuestion: { fieldKey: 'tone', questionText: 'Tone?' },
      progress: { answeredCount: 1, skippedCount: 1, totalCount: 10 },
      status: 'in_progress',
    }),
    start: vi.fn().mockResolvedValue({
      brandId: 'brand-1',
      completenessScore: 40,
      creditsCharged: 10,
      currentQuestion: { fieldKey: 'audience', questionText: 'Audience?' },
      interviewId: 'interview-1',
      progress: { answeredCount: 0, skippedCount: 0, totalCount: 10 },
      status: 'in_progress',
    }),
    submitAnswer: vi.fn().mockResolvedValue({
      completenessScore: 50,
      interviewId: 'interview-1',
      isComplete: false,
      nextQuestion: { fieldKey: 'tone', questionText: 'Tone?' },
      progress: { answeredCount: 1, skippedCount: 0, totalCount: 10 },
      status: 'in_progress',
    }),
    ...service,
  };

  return {
    brandInterviewService,
    handler: new AgentBrandInterviewToolHandler(brandInterviewService as never),
  };
}

describe('AgentBrandInterviewToolHandler', () => {
  it('starts an interview when brandId is provided', async () => {
    const { brandInterviewService, handler } = createHandler();
    const result = await handler.startBrandInterview(
      { brandId: 'brand-1' },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(result.creditsUsed).toBe(10);
    expect(brandInterviewService.start).toHaveBeenCalledWith(
      'brand-1',
      CTX.organizationId,
      CTX.userId,
    );
  });

  it('fails start when brandId is missing', async () => {
    const { handler } = createHandler();
    const result = await handler.startBrandInterview({}, CTX);
    expect(result.success).toBe(false);
    expect(result.error).toContain('brandId');
  });

  it('fails closed when the interview service is unavailable', async () => {
    const handler = new AgentBrandInterviewToolHandler(undefined);
    const result = await handler.getBrandCompleteness(
      { brandId: 'brand-1' },
      CTX,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('not available');
  });

  it('submits an answer and returns progress', async () => {
    const { brandInterviewService, handler } = createHandler();
    const result = await handler.submitBrandInterviewAnswer(
      { answer: 'Developers', interviewId: 'interview-1' },
      CTX,
    );

    expect(result.success).toBe(true);
    expect(brandInterviewService.submitAnswer).toHaveBeenCalledWith(
      'interview-1',
      CTX.organizationId,
      CTX.userId,
      'Developers',
    );
  });
});

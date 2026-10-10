/** Internal caller-owned continuation. Never parsed from analysis DTOs or workflow input JSON. */
export type OptimizerAnalysisContinuation = Readonly<{
  reauthorize: () => Promise<void>;
  beforeAttempt: (maximumCredits: number) => Promise<void>;
  acceptedAttempt: (actualCredits: number) => Promise<void>;
  scoreBinding: Readonly<{
    responseId: string;
    outputId: string;
    postId: string;
    strategyId: string;
    workflowExecutionId: string;
    materialHash: string;
  }>;
}>;

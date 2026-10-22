import type { LoggerService } from '@libs/logger/logger.service';

export type ContextRetrievalStage =
  | 'query_embedding'
  | 'similarity_sql'
  | 'result_validation'
  | 'scope_validation';

export async function measureContextRetrievalStage<T>(
  logger: Pick<LoggerService, 'log'>,
  stage: ContextRetrievalStage,
  work: () => Promise<T> | T,
  count?: (result: T) => number,
): Promise<T> {
  const started = performance.now();
  let outcome: 'success' | 'failure' = 'failure';
  let rowCount: number | undefined;
  try {
    const result = await work();
    if (count) rowCount = count(result);
    outcome = 'success';
    return result;
  } finally {
    logger.log('context_retrieval_stage', {
      stage,
      outcome,
      durationMs: Math.max(0, performance.now() - started),
      ...(rowCount !== undefined ? { rowCount } : {}),
    });
  }
}

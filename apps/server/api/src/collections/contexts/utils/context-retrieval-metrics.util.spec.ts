import { measureContextRetrievalStage } from '@api/collections/contexts/utils/context-retrieval-metrics.util';
import { describe, expect, it, vi } from 'vitest';

describe('context retrieval stage events', () => {
  it('reports bounded stage timing and honest empty counts without content identifiers', async () => {
    const logger = { log: vi.fn() };
    const rows = await measureContextRetrievalStage(
      logger,
      'scope_validation',
      () => [],
      (result) => result.length,
    );
    expect(rows).toEqual([]);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith(
      'context_retrieval_stage',
      {
        stage: 'scope_validation',
        outcome: 'success',
        durationMs: expect.any(Number),
        rowCount: 0,
      },
    );
    expect(logger.log.mock.calls[0][1].durationMs).toBeGreaterThanOrEqual(0);
    expect(Object.keys(logger.log.mock.calls[0][1]).sort()).toEqual([
      'durationMs',
      'outcome',
      'rowCount',
      'stage',
    ]);
  });
  it('records failure in finally and rethrows without serializing provider payload, query or credentials', async () => {
    const logger = { log: vi.fn() };
    const failure = new Error(
      'private query, source URL, provider payload, token',
    );
    await expect(
      measureContextRetrievalStage(logger, 'query_embedding', async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(logger.log).toHaveBeenCalledExactlyOnceWith(
      'context_retrieval_stage',
      {
        stage: 'query_embedding',
        outcome: 'failure',
        durationMs: expect.any(Number),
      },
    );
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain(
      failure.message,
    );
  });
});

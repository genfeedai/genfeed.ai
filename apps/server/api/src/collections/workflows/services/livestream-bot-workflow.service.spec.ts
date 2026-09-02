import { LivestreamBotWorkflowService } from '@api/collections/workflows/services/livestream-bot-workflow.service';
import { describe, expect, it, vi } from 'vitest';

describe('LivestreamBotWorkflowService atomic actions', () => {
  it('isolates one target delivery failure as an action result', async () => {
    const livestream = {
      deliverActiveSessionTarget: vi.fn().mockRejectedValue(new Error('down')),
    };
    const service = new LivestreamBotWorkflowService(
      livestream as never,
      {} as never,
    );

    await expect(
      service.deliverActiveSessionTarget('org-1', { item: { id: 'target-1' } }),
    ).resolves.toEqual({ error: 'down', status: 'failed' });
  });

  it('aggregates per-target child results without delivering in the finalizer', () => {
    const service = new LivestreamBotWorkflowService({} as never, {} as never);

    expect(
      service.finalizeActiveSession({
        batch: {
          results: [
            { result: { status: 'processed' } },
            { result: { status: 'skipped' } },
          ],
        },
        state: { sessionId: 'session-1', status: 'loaded' },
      }),
    ).toEqual({ sessionId: 'session-1', status: 'processed', targets: 2 });
  });
});

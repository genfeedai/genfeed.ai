import { ReplyPollingWorkflowService } from '@api/collections/workflows/services/reply-polling-workflow.service';
import { describe, expect, it } from 'vitest';

describe('ReplyPollingWorkflowService atomic actions', () => {
  function buildService() {
    return new ReplyPollingWorkflowService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('adapts one credential into the registered reply-bot workflow request', () => {
    expect(
      buildService().prepareReplyBotTarget('org-1', {
        item: { credentialId: 'credential-1' },
      }),
    ).toEqual({ credentialId: 'credential-1', organizationId: 'org-1' });
  });

  it('summarizes one child workflow result without invoking reply orchestration', () => {
    expect(
      buildService().finalizeReplyBotTarget({
        results: [
          { errors: 1, repliesSent: 2 },
          { errors: 0, repliesSent: 1 },
        ],
      }),
    ).toEqual({ errors: 1, status: 'processed', triggered: 3 });
  });
});

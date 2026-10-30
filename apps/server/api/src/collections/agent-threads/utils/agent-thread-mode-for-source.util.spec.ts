import {
  canThreadSourceReviewPlans,
  resolveThreadModeForSource,
} from '@api/collections/agent-threads/utils/agent-thread-mode-for-source.util';
import { AgentThreadMode } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

describe('agent thread mode for source', () => {
  it('starts an extension thread in Auto when the saved default is Plan', () => {
    expect(resolveThreadModeForSource(AgentThreadMode.PLAN, 'extension')).toBe(
      AgentThreadMode.AUTO,
    );
  });

  it.each([AgentThreadMode.AUTO, AgentThreadMode.MANUAL])(
    'keeps the saved %s default for an extension thread',
    (mode) => {
      expect(resolveThreadModeForSource(mode, 'extension')).toBe(mode);
    },
  );

  it.each(['web', 'agent', undefined, null])(
    'keeps Plan for a thread whose source is %s',
    (source) => {
      expect(resolveThreadModeForSource(AgentThreadMode.PLAN, source)).toBe(
        AgentThreadMode.PLAN,
      );
    },
  );

  it('lets every source except the extension review plans', () => {
    expect(canThreadSourceReviewPlans('extension')).toBe(false);
    expect(canThreadSourceReviewPlans('web')).toBe(true);
    expect(canThreadSourceReviewPlans(undefined)).toBe(true);
  });
});

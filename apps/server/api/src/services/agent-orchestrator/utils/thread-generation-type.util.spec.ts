import { resolveLockedGenerationType } from '@api/services/agent-orchestrator/utils/thread-generation-type.util';
import { describe, expect, it } from 'vitest';

describe('resolveLockedGenerationType', () => {
  it('ignores non-generation cards', () => {
    expect(
      resolveLockedGenerationType([
        { uiActions: [{ id: 'preview', type: 'content_preview_card' }] },
      ]),
    ).toBeNull();
  });
});

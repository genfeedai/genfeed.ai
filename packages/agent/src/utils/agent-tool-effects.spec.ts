import { PUBLISHING_CONTENT_REFRESH_EVENT } from '@genfeedai/contracts/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchAgentToolEffects } from './agent-tool-effects';

describe('dispatchAgentToolEffects', () => {
  const onPublishingRefresh = vi.fn();

  beforeEach(() => {
    window.addEventListener(
      PUBLISHING_CONTENT_REFRESH_EVENT,
      onPublishingRefresh,
    );
  });

  afterEach(() => {
    window.removeEventListener(
      PUBLISHING_CONTENT_REFRESH_EVENT,
      onPublishingRefresh,
    );
    onPublishingRefresh.mockReset();
  });

  it('reloads Publishing once when a run completed a post tool', () => {
    dispatchAgentToolEffects([
      { status: 'completed', toolName: 'get_posts' },
      { status: 'completed', toolName: 'create_post' },
      { status: 'completed', toolName: 'schedule_post' },
    ]);

    expect(onPublishingRefresh).toHaveBeenCalledTimes(1);
  });

  it('ignores a post tool that failed', () => {
    dispatchAgentToolEffects([{ status: 'failed', toolName: 'schedule_post' }]);

    expect(onPublishingRefresh).not.toHaveBeenCalled();
  });

  it('ignores tools that do not change Publishing content', () => {
    dispatchAgentToolEffects([
      { status: 'completed', toolName: 'get_posts' },
      { status: 'completed', toolName: 'list_assets' },
    ]);
    dispatchAgentToolEffects(undefined);
    dispatchAgentToolEffects([]);

    expect(onPublishingRefresh).not.toHaveBeenCalled();
  });
});

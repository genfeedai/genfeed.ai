import {
  LIBRARY_ASSETS_REFRESH_EVENT,
  PUBLISHING_CONTENT_REFRESH_EVENT,
} from '@genfeedai/contracts/constants';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchAgentToolEffects } from './agent-tool-effects';

describe('dispatchAgentToolEffects', () => {
  const onPublishingRefresh = vi.fn();
  const onLibraryRefresh = vi.fn();

  beforeEach(() => {
    window.addEventListener(LIBRARY_ASSETS_REFRESH_EVENT, onLibraryRefresh);
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
    window.removeEventListener(LIBRARY_ASSETS_REFRESH_EVENT, onLibraryRefresh);
    onLibraryRefresh.mockReset();
  });

  it('reloads Publishing once when a run completed a post tool', () => {
    dispatchAgentToolEffects([
      { status: 'completed', toolName: 'get_posts' },
      { status: 'completed', toolName: 'create_post' },
      { status: 'completed', toolName: 'schedule_post' },
    ]);

    expect(onPublishingRefresh).toHaveBeenCalledTimes(1);
    expect(onLibraryRefresh).not.toHaveBeenCalled();
  });

  it('reloads the Library once when a run starred an asset', () => {
    dispatchAgentToolEffects([
      { status: 'completed', toolName: 'list_assets' },
      { status: 'completed', toolName: 'star_asset' },
      { status: 'completed', toolName: 'star_asset' },
    ]);

    expect(onLibraryRefresh).toHaveBeenCalledTimes(1);
    expect(onPublishingRefresh).not.toHaveBeenCalled();
  });

  it('ignores a star that failed', () => {
    dispatchAgentToolEffects([{ status: 'failed', toolName: 'star_asset' }]);

    expect(onLibraryRefresh).not.toHaveBeenCalled();
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
    expect(onLibraryRefresh).not.toHaveBeenCalled();
  });
});

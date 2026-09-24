import { describe, expect, it } from 'vitest';

import { extensionIdeaTab } from '../src/utils/extension-idea-tab.util';

describe('extensionIdeaTab', () => {
  it('opens a supported post on Imported review', () => {
    expect(
      extensionIdeaTab({
        captureMode: 'page',
        url: 'https://x.com/author/status/123',
      }),
    ).toBe('idea');
  });

  it('keeps a text selection on explicit Knowledge capture', () => {
    expect(
      extensionIdeaTab({
        captureMode: 'selection',
        url: 'https://x.com/author/status/123',
      }),
    ).toBe('knowledge');
  });

  it('keeps an ordinary page on explicit Knowledge capture', () => {
    expect(
      extensionIdeaTab({
        captureMode: 'page',
        url: 'https://example.com/article',
      }),
    ).toBe('knowledge');
  });
});

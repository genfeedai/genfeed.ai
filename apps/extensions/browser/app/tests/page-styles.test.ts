import { beforeEach, describe, expect, it } from 'vitest';

import { injectImageOverlayStyles } from '~platforms/ui/page-styles';

describe('image overlay styles', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it("keeps the actions on the top edge, clear of X's video controls", () => {
    injectImageOverlayStyles();

    const css = document.getElementById(
      'genfeed-extension-styles',
    )?.textContent;
    const overlayRule = css?.match(/\.genfeed-image-overlay \{([^}]*)\}/)?.[1];

    expect(overlayRule).toContain('top: 8px');
    expect(overlayRule).not.toContain('bottom');
    expect(overlayRule).toContain('flex-flow: row wrap');
  });
});

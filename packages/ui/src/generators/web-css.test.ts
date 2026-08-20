import { describe, expect, it } from 'vitest';
import { generateWebTokenCss } from './web-css';

describe('generateWebTokenCss', () => {
  it('provides a System dark fallback until a resolved attribute is applied', () => {
    const css = generateWebTokenCss();

    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(':root:not([data-theme])');
    expect(css).toContain('--background: 0 0% 4%');
  });
});

import {
  CONTENT_ICON_CLASS,
  SHELL_CONTROL_HEIGHT_CLASS,
  SHELL_ICON_BUTTON_CLASS,
  SHELL_ICON_CLASS,
  SHELL_ICON_SVG_CLASS,
} from '@ui-constants/shell-chrome.constant';
import { describe, expect, it } from 'vitest';

describe('shell-chrome.constant', () => {
  it('exports the chrome (3.5) and content (4) icon tiers', () => {
    expect(SHELL_ICON_CLASS).toContain('size-3.5');
    expect(CONTENT_ICON_CLASS).toContain('size-4');
    expect(SHELL_ICON_SVG_CLASS).toContain('[&_svg]:size-3.5');
    expect(SHELL_ICON_BUTTON_CLASS).toContain('size-8');
    expect(SHELL_CONTROL_HEIGHT_CLASS).toBe('h-8');
  });
});

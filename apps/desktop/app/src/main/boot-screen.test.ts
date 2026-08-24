import { describe, expect, it } from 'bun:test';
import {
  buildDesktopFailureScreenHtml,
  buildDesktopFailureScreenUrl,
  buildDesktopLoadingScreenHtml,
  buildDesktopLoadingScreenUrl,
  getDesktopBootBackground,
} from './boot-screen';

describe('desktop boot screen', () => {
  it('uses a native-theme-aware first-paint background', () => {
    expect(getDesktopBootBackground('light')).toBe('#fafaf9');
    expect(getDesktopBootBackground('dark')).toBe('#030303');

    const html = buildDesktopLoadingScreenHtml();
    expect(html).toContain('color-scheme: light dark');
    expect(html).toContain('@media (prefers-color-scheme: dark)');
    expect(html).toContain('--desktop-boot-background: #fafaf9');
    expect(html).toContain('--desktop-boot-background: #030303');
  });

  it('renders the official Genfeed mark, not a homemade wordmark', () => {
    const html = buildDesktopLoadingScreenHtml();

    expect(html).toContain('aria-label="Genfeed is loading"');
    expect(html).toContain('aria-label="Genfeed"');
    expect(html).toContain('viewBox="0 0 500 500"');
    expect(html).toContain('M2360 4944');
    expect(html).not.toContain('viewBox="0 0 760 160"');
    expect(html).toContain('@keyframes boot-pulse');
    expect(html).toContain('@keyframes boot-spin');
  });

  it('keeps the failure screen on the same adaptive shell surface', () => {
    const html = buildDesktopFailureScreenHtml();

    expect(html).toContain('Genfeed could not start');
    expect(html).toContain('Your local data is still safe');
    expect(html).toContain('background: var(--desktop-boot-background)');
    expect(html).toContain('color: var(--desktop-boot-muted)');
  });

  it('encodes boot screens as loadable data urls', () => {
    expect(buildDesktopLoadingScreenUrl()).toStartWith(
      'data:text/html;charset=utf-8,',
    );
    expect(buildDesktopFailureScreenUrl()).toStartWith(
      'data:text/html;charset=utf-8,',
    );
  });
});

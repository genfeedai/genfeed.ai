import { describe, expect, it } from 'bun:test';
import {
  buildDesktopFailureScreenHtml,
  buildDesktopFailureScreenUrl,
  buildDesktopLoadingScreenHtml,
  buildDesktopLoadingScreenUrl,
  getDesktopBootBackground,
} from './boot-screen';

describe('desktop boot screen', () => {
  it('uses a black first-paint background', () => {
    expect(getDesktopBootBackground()).toBe('#000000');
    expect(buildDesktopLoadingScreenHtml()).toContain('background: #000000');
  });

  it('renders an animated Genfeed loading mark', () => {
    const html = buildDesktopLoadingScreenHtml();

    expect(html).toContain('aria-label="Genfeed is loading"');
    expect(html).toContain('aria-label="Genfeed"');
    expect(html).toContain('@keyframes boot-pulse');
    expect(html).toContain('@keyframes boot-spin');
  });

  it('keeps the failure screen on the same black shell surface', () => {
    const html = buildDesktopFailureScreenHtml();

    expect(html).toContain('Genfeed could not start');
    expect(html).toContain('background: #000000');
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

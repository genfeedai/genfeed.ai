import { describe, expect, it } from 'vitest';

import {
  buildSystemEmailHtml,
  buildSystemEmailParagraph,
  escapeSystemEmailHtml,
  sanitizeSystemEmailUrl,
} from './system-email.helper';

describe('system email helpers', () => {
  it('escapes html-sensitive characters', () => {
    expect(escapeSystemEmailHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('renders a branded system email shell', () => {
    const html = buildSystemEmailHtml({
      action: {
        label: 'Open',
        url: 'https://app.genfeed.ai/settings',
      },
      bodyHtml: buildSystemEmailParagraph('Use this secure link once.'),
      footerNote: 'Ignore this email if you did not request it.',
      title: 'Secure Genfeed link',
    });

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Genfeed.ai');
    expect(html).toContain('Secure Genfeed link');
    expect(html).toContain('https://app.genfeed.ai/settings');
    expect(html).toContain('Ignore this email if you did not request it.');
  });
});

describe('sanitizeSystemEmailUrl', () => {
  it('keeps http, https and mailto targets verbatim', () => {
    expect(sanitizeSystemEmailUrl('https://app.genfeed.ai/settings')).toBe(
      'https://app.genfeed.ai/settings',
    );
    expect(sanitizeSystemEmailUrl('http://localhost:3010/verify')).toBe(
      'http://localhost:3010/verify',
    );
    expect(sanitizeSystemEmailUrl('mailto:support@genfeed.ai')).toBe(
      'mailto:support@genfeed.ai',
    );
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(sanitizeSystemEmailUrl('  https://app.genfeed.ai  ')).toBe(
      'https://app.genfeed.ai',
    );
  });

  it('rejects script-bearing schemes', () => {
    expect(sanitizeSystemEmailUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeSystemEmailUrl('JavaScript:alert(1)')).toBeNull();
    expect(
      sanitizeSystemEmailUrl('data:text/html;base64,PHNjcmlwdD4='),
    ).toBeNull();
    expect(sanitizeSystemEmailUrl('vbscript:msgbox(1)')).toBeNull();
    expect(sanitizeSystemEmailUrl('file:///etc/passwd')).toBeNull();
  });

  it('rejects relative and empty targets', () => {
    expect(sanitizeSystemEmailUrl('/settings')).toBeNull();
    expect(sanitizeSystemEmailUrl('app.genfeed.ai')).toBeNull();
    expect(sanitizeSystemEmailUrl('   ')).toBeNull();
    expect(sanitizeSystemEmailUrl('')).toBeNull();
  });
});

describe('buildSystemEmailHtml link safety', () => {
  it('drops the action button when the target scheme is untrusted', () => {
    const html = buildSystemEmailHtml({
      action: {
        label: 'Review post',
        url: 'javascript:alert(document.cookie)',
      },
      bodyHtml: buildSystemEmailParagraph('A post is waiting for review.'),
      title: 'Review required',
    });

    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('Review post');
    expect(html).toContain('A post is waiting for review.');
  });

  it('renders the action button for a trusted target', () => {
    const html = buildSystemEmailHtml({
      action: { label: 'Review post', url: 'https://app.genfeed.ai/review/1' },
      bodyHtml: buildSystemEmailParagraph('A post is waiting for review.'),
      title: 'Review required',
    });

    expect(html).toContain('href="https://app.genfeed.ai/review/1"');
    expect(html).toContain('Review post');
  });

  it('falls back to the default app url when appUrl is untrusted', () => {
    const html = buildSystemEmailHtml({
      appUrl: 'javascript:alert(1)',
      bodyHtml: buildSystemEmailParagraph('Body.'),
      title: 'Notice',
    });

    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="https://app.genfeed.ai"');
  });

  it('still renders an unlinked brand mark when appUrl is explicitly empty', () => {
    const html = buildSystemEmailHtml({
      appUrl: '',
      bodyHtml: buildSystemEmailParagraph('Body.'),
      title: 'Notice',
    });

    expect(html).not.toContain('Open Genfeed</a>');
    expect(html).toContain('Genfeed.ai</span>');
  });
});

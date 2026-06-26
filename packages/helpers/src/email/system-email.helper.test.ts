import { describe, expect, it } from 'vitest';

import {
  buildSystemEmailHtml,
  buildSystemEmailParagraph,
  escapeSystemEmailHtml,
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

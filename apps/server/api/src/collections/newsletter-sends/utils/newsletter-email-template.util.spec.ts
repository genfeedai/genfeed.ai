import {
  extractTrackedLinks,
  markdownToPlainText,
  personalizeNewsletterEmail,
  previewMarkdown,
  renderNewsletterEmail,
} from '@api/collections/newsletter-sends/utils/newsletter-email-template.util';
import { describe, expect, it } from 'vitest';

const footer = {
  attributionUrl: 'https://genfeed.ai/?utm_source=newsletter-footer',
  footerText: 'You get this because you subscribed.',
  isAttributionEnabled: true,
  postalAddress: '1 Market St, San Francisco',
  senderName: 'Field Notes',
};

describe('newsletter email template', () => {
  it('tracks each distinct web link once and leaves mailto links alone', () => {
    expect(
      extractTrackedLinks(
        '<a href="https://a.test/x?y=1&amp;z=2">A</a> <a href="https://a.test/x?y=1&z=2">again</a> <a href="mailto:hi@a.test">mail</a>',
      ),
    ).toEqual({
      html: '<a href="{{link:0}}">A</a> <a href="{{link:0}}">again</a> <a href="mailto:hi@a.test">mail</a>',
      links: ['https://a.test/x?y=1&z=2'],
    });
  });

  it('renders the brand, body, footer and attribution with placeholders kept', () => {
    const template = renderNewsletterEmail(
      { label: 'Field <Notes>', primaryColor: '#123456' },
      {
        bodyHtml: '<p>Read <a href="https://blog.test/post">the post</a></p>',
        bodyText: 'Read the post (https://blog.test/post)',
        title: 'Issue 1',
        webUrl: 'https://api.test/v1/public/newsletter/issues/abc',
      },
      footer,
    );

    expect(template.links).toEqual(['https://blog.test/post']);
    expect(template.html).toContain('Field &lt;Notes&gt;');
    expect(template.html).toContain('href="{{link:0}}"');
    expect(template.html).toContain('{{unsubscribeUrl}}');
    expect(template.html).toContain('1 Market St, San Francisco');
    expect(template.html).toContain('Sent with Genfeed');
    expect(template.html).not.toContain('https://blog.test/post');
    expect(template.text).toContain('{{unsubscribeUrl}}');
  });

  it('drops the attribution when the brand turned it off', () => {
    const template = renderNewsletterEmail(
      { label: 'Field Notes' },
      { bodyHtml: '<p>Hi</p>', bodyText: 'Hi', title: 'Issue 1' },
      { ...footer, isAttributionEnabled: false },
    );

    expect(template.html).not.toContain('Sent with Genfeed');
  });

  it("fills one recipient's unsubscribe and tracked links, escaped", () => {
    expect(
      personalizeNewsletterEmail(
        {
          html: '<a href="{{link:0}}">x</a><a href="{{unsubscribeUrl}}">u</a>',
          text: 'Unsubscribe: {{unsubscribeUrl}}',
        },
        {
          linkUrl: (index) => `https://api.test/c/${index}?a=1&b=2`,
          unsubscribeUrl: 'https://api.test/u/tok',
        },
      ),
    ).toEqual({
      html: '<a href="https://api.test/c/0?a=1&amp;b=2">x</a><a href="https://api.test/u/tok">u</a>',
      text: 'Unsubscribe: https://api.test/u/tok',
    });
  });

  it('cuts a gated preview on a paragraph boundary', () => {
    expect(previewMarkdown('First.\n\nSecond.\n\nThird.', 14)).toBe(
      'First.\n\nSecond.',
    );
  });

  it('turns Markdown into readable plain text', () => {
    expect(
      markdownToPlainText('# Title\n\nSee **[the post](https://a.test)**.'),
    ).toBe('Title\n\nSee the post (https://a.test).');
  });
});

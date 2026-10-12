import { renderNewsletterHtml } from '@api/collections/newsletters/utils/newsletter-html.util';

describe('renderNewsletterHtml', () => {
  it('renders Markdown to HTML', () => {
    const html = renderNewsletterHtml('# Weekly\n\nHello **readers**.');

    expect(html).toContain('<h1');
    expect(html).toContain('Weekly');
    expect(html).toContain('<strong>readers</strong>');
  });

  it('strips script content', () => {
    expect(renderNewsletterHtml('Hi <script>alert(1)</script>')).not.toContain(
      '<script',
    );
  });
});

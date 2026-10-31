import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import NotFound from './not-found';

describe('website not found page', () => {
  it('gives humans and agents concrete recovery routes', () => {
    const html = renderToStaticMarkup(<NotFound />);

    expect(html).toContain('Page not found');
    expect(html).toContain('href="/sitemap.xml"');
    expect(html).toContain('href="/llms.txt"');
    expect(html).toContain('href="https://docs.genfeed.ai"');
  });
});

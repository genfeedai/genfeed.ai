import { describe, expect, it } from 'vitest';
import { buildArticleSections } from './article-sections';

describe('buildArticleSections', () => {
  it('anchors each h2 and h3 on an id read from its text', () => {
    const { html, sections } = buildArticleSections(
      '<h2>Stage 1: Build the cast</h2><p>Body</p><h3>Pick &amp; name them</h3>',
    );

    expect(sections).toEqual([
      {
        id: 'stage-1-build-the-cast',
        label: 'Stage 1: Build the cast',
        level: 2,
      },
      { id: 'pick-name-them', label: 'Pick & name them', level: 3 },
    ]);
    expect(html).toBe(
      '<h2 id="stage-1-build-the-cast" class="scroll-mt-24">Stage 1: Build the cast<a class="gen-heading-anchor" href="#stage-1-build-the-cast" aria-hidden="true" tabindex="-1">#</a></h2><p>Body</p><h3 id="pick-name-them" class="scroll-mt-24">Pick &amp; name them<a class="gen-heading-anchor" href="#pick-name-them" aria-hidden="true" tabindex="-1">#</a></h3>',
    );
  });

  it('keeps ids unique when headings repeat', () => {
    const { sections } = buildArticleSections(
      '<h2>Setup</h2><h2>Setup</h2><h2>Setup</h2>',
    );

    expect(sections.map((section) => section.id)).toEqual([
      'setup',
      'setup-2',
      'setup-3',
    ]);
  });

  it('keeps an id the author already set', () => {
    const { sections } = buildArticleSections('<h2 id="faq">Questions</h2>');

    expect(sections).toEqual([{ id: 'faq', label: 'Questions', level: 2 }]);
  });

  it('leaves empty headings and other levels alone', () => {
    const source = '<h1>Title</h1><h2> </h2><h4>Deep</h4>';

    expect(buildArticleSections(source)).toEqual({
      html: source,
      sections: [],
    });
  });

  it('folds a trailing Sources list into a closed details under its heading', () => {
    const { html, sections } = buildArticleSections(
      '<h2>Conclusion</h2><p>Done.</p><h2>Sources</h2><ul><li>One</li><li>Two</li></ul>',
    );

    expect(sections.map((section) => section.id)).toEqual([
      'conclusion',
      'sources',
    ]);
    expect(html).toContain(
      '</h2><details class="gen-article-sources"><summary><span class="gen-sources-closed">Show 2 sources</span><span class="gen-sources-open">Hide sources</span></summary><ul><li>One</li><li>Two</li></ul></details>',
    );
    expect(html).not.toContain('<details open');
  });

  it('stops the fold at the next h2', () => {
    const { html } = buildArticleSections(
      '<h2>References</h2><ol><li>A</li></ol><h2>Next</h2><p>After</p>',
    );

    expect(html).toContain('Show 1 source</span>');
    expect(html).toContain('</details><h2 id="next"');
  });

  it('leaves a Sources heading with nothing under it alone', () => {
    const { html } = buildArticleSections('<h2>Sources</h2>');

    expect(html).not.toContain('<details');
  });
});

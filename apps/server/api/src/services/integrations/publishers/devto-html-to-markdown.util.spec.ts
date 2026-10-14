import {
  htmlToDevtoMarkdown,
  readDevtoTags,
} from '@api/services/integrations/publishers/devto-html-to-markdown.util';

describe('htmlToDevtoMarkdown', () => {
  it('keeps headings, links, lists, code blocks and images as Markdown', () => {
    const markdown = htmlToDevtoMarkdown(
      [
        '<h2>Intro</h2>',
        '<p>Read the <a href="https://example.com/docs">docs</a>.</p>',
        '<ul><li>One</li><li>Two</li></ul>',
        '<pre><code class="language-ts">const value = 1;</code></pre>',
        '<p><img alt="Cover" src="https://cdn.example.com/cover.png"></p>',
      ].join(''),
    );

    expect(markdown).toContain('## Intro');
    expect(markdown).toContain('[docs](https://example.com/docs)');
    expect(markdown).toMatch(/^- +One$/m);
    expect(markdown).toMatch(/^- +Two$/m);
    expect(markdown).toContain('```');
    expect(markdown).toContain('const value = 1;');
    expect(markdown).toContain('![Cover](https://cdn.example.com/cover.png)');
    expect(markdown).not.toMatch(/<\/?[a-z]/i);
  });

  it('does not send script markup or its text as Markdown', () => {
    const markdown = htmlToDevtoMarkdown(
      '<p>Hello</p><script>alert(1)</script>',
    );

    expect(markdown).toContain('Hello');
    expect(markdown).not.toContain('script');
    expect(markdown).not.toContain('alert');
  });

  it('keeps an example tag that lives inside a fenced code block', () => {
    const markdown = htmlToDevtoMarkdown(
      '<pre><code>&lt;div&gt;example&lt;/div&gt;</code></pre>',
    );

    expect(markdown).toContain('```');
    expect(markdown).toContain('<div>example</div>');
  });
});

describe('readDevtoTags', () => {
  it('keeps the first four alphanumeric tags', () => {
    expect(
      readDevtoTags('TypeScript, Web Dev, node, api, fifth, typescript'),
    ).toEqual(['typescript', 'webdev', 'node', 'api']);
  });

  it('returns nothing when the setting is empty', () => {
    expect(readDevtoTags(undefined)).toEqual([]);
    expect(readDevtoTags(' , , ')).toEqual([]);
  });
});

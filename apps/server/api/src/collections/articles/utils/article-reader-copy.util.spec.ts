import {
  assertArticleIsReaderCopy,
  findArticleProcessNote,
} from '@api/collections/articles/utils/article-reader-copy.util';
import { BadRequestException } from '@nestjs/common';

describe('findArticleProcessNote', () => {
  it('finds the section that leaked into the tokens article', () => {
    const html = [
      '<h2>Where we are going</h2><p>Prices step up.</p>',
      '<h2>What we could not verify</h2>',
      "<ul><li>OpenAI's pricing page blocked automated access.</li></ul>",
      '<h2>Sources</h2><ul><li>Anthropic</li></ul>',
    ].join('\n');

    expect(findArticleProcessNote(html)).toBe(
      'the section "What we could not verify"',
    );
  });

  it.each([
    ['<h3>What I couldn&#x27;t verify</h3>', "What I couldn't verify"],
    ['<h2><strong>Research notes</strong></h2>', 'Research notes'],
    ['<h2>Unverified claims</h2>', 'Unverified claims'],
    ['<h2>What&nbsp;we could not verify</h2>', 'What we could not verify'],
    ['<h2>What we couldn&#8217;t verify</h2>', 'What we couldn’t verify'],
    ['<h2>Limitations of this research</h2>', 'Limitations of this research'],
  ])('finds the heading in %s', (html, heading) => {
    expect(findArticleProcessNote(html)).toBe(`the section "${heading}"`);
  });

  it.each([
    [
      '<p>[TODO: optional. One real thing from your own last month.]</p>',
      '[TODO: optional. One real thing from your own last month.]',
    ],
    ['<p><strong>Watch the video: [VIDEO LINK]</strong></p>', '[VIDEO LINK]'],
    ['<p>Insert [INSERT CHART HERE] below.</p>', '[INSERT CHART HERE]'],
    ['<p>[<strong>TODO</strong>]</p>', '[TODO]'],
    ['<p>&#91;VIDEO LINK&#93;</p>', '[VIDEO LINK]'],
  ])('finds the placeholder in %s', (html, placeholder) => {
    expect(findArticleProcessNote(html)).toBe(`the placeholder ${placeholder}`);
  });

  it('leaves reader copy that talks about checking and limits alone', () => {
    const html = [
      '<h2>Where it stops</h2><p>It is short-form.</p>',
      '<h2>How we checked the prices</h2><p>Each one comes from the vendor page.</p>',
      '<pre><code>Keep [CORNER] empty for the channel mark.</code></pre>',
      '<p>Replace [CORNER] with wherever your own mark goes.</p>',
    ].join('\n');

    expect(findArticleProcessNote(html)).toBeUndefined();
  });

  it.each([[undefined], [null], ['']])('accepts empty content %j', (html) => {
    expect(findArticleProcessNote(html)).toBeUndefined();
  });
});

describe('assertArticleIsReaderCopy', () => {
  it('names the part to remove in a BadRequestException', () => {
    expect(() =>
      assertArticleIsReaderCopy('<h2>What we could not verify</h2><p>x</p>'),
    ).toThrow(BadRequestException);
    expect(() =>
      assertArticleIsReaderCopy('<h2>What we could not verify</h2><p>x</p>'),
    ).toThrow('remove the section "What we could not verify"');
  });

  it('passes clean copy', () => {
    expect(() =>
      assertArticleIsReaderCopy('<h2>Sources</h2><p>Anthropic</p>'),
    ).not.toThrow();
  });
});

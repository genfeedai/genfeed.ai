import { describe, expect, it } from 'vitest';
import {
  buildContentPreview,
  withholdGatedContent,
} from './article-preview.util';

const paragraph = (index: number, length = 300) =>
  `<p>Paragraph ${index} ${'x'.repeat(length)}</p>`;

describe('buildContentPreview', () => {
  it.each([
    ['empty content', null, ''],
    ['blank content', '   ', ''],
  ])('returns nothing for %s', (_name, content, preview) => {
    expect(buildContentPreview(content)).toBe(preview);
  });

  it('keeps the first HTML blocks up to about 600 characters', () => {
    const content = [1, 2, 3, 4, 5, 6, 7, 8]
      .map((index) => paragraph(index))
      .join('');

    expect(buildContentPreview(content)).toBe(paragraph(1) + paragraph(2));
  });

  it('never gives away more than half of the blocks', () => {
    const content = [
      paragraph(1, 20),
      paragraph(2, 20),
      paragraph(3, 20),
      paragraph(4, 20),
    ].join('');

    expect(buildContentPreview(content)).toBe(
      paragraph(1, 20) + paragraph(2, 20),
    );
  });

  it('splits plain text and Markdown at blank lines', () => {
    expect(
      buildContentPreview('First part.\n\nSecond part.\n\nThird.\n\nFourth.'),
    ).toBe('First part.\n\nSecond part.');
  });

  it('cuts a single long block in half at a word', () => {
    expect(buildContentPreview('<p>one two three four five six</p>')).toBe(
      '<p>one two three…</p>',
    );
  });
});

describe('withholdGatedContent', () => {
  const body = [1, 2, 3, 4].map((index) => paragraph(index, 20)).join('');

  it.each([
    ['public', body],
    [null, body],
    ['subscribers', paragraph(1, 20) + paragraph(2, 20)],
    ['paid', paragraph(1, 20) + paragraph(2, 20)],
  ])('serves %s articles %s', (accessLevel, content) => {
    expect(withholdGatedContent({ accessLevel, content: body }).content).toBe(
      content,
    );
  });
});

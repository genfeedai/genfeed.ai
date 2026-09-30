import { htmlToText } from '@api/shared/utils/html-to-text/html-to-text.util';
import { describe, expect, it } from 'vitest';

describe('htmlToText', () => {
  it('returns empty string for null', () => {
    expect(htmlToText(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(htmlToText(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(htmlToText('')).toBe('');
  });

  it('converts paragraph tags to double newlines', () => {
    const result = htmlToText('<p>Hello</p><p>World</p>');
    expect(result).toContain('Hello');
    expect(result).toContain('World');
    expect(result).toContain('\n');
  });

  it('converts br tags to newlines', () => {
    const result = htmlToText('Line 1<br>Line 2');
    expect(result).toBe('Line 1\nLine 2');
  });

  it('converts self-closing br tags', () => {
    const result = htmlToText('Line 1<br/>Line 2');
    expect(result).toBe('Line 1\nLine 2');
  });

  it('strips HTML tags', () => {
    const result = htmlToText('<strong>bold</strong> text');
    expect(result).toBe('bold text');
  });

  it('preserves plain text content', () => {
    const result = htmlToText('Hello World');
    expect(result).toBe('Hello World');
  });

  it('handles nested HTML', () => {
    const result = htmlToText('<p>Text with <strong>bold</strong> content</p>');
    expect(result).toContain('Text with bold content');
  });

  it('handles heading tags', () => {
    const result = htmlToText('<h1>Title</h1><p>Content</p>');
    expect(result).toContain('Title');
    expect(result).toContain('Content');
  });

  it('handles list items', () => {
    const result = htmlToText('<ul><li>Item 1</li><li>Item 2</li></ul>');
    expect(result).toContain('Item 1');
    expect(result).toContain('Item 2');
  });

  it('decodes named entities', () => {
    expect(htmlToText('a &amp; b')).toBe('a & b');
    expect(htmlToText('&quot;quoted&quot;')).toBe('"quoted"');
    expect(htmlToText('it&#39;s')).toBe("it's");
  });

  it('collapses a non-breaking space into a regular space', () => {
    expect(htmlToText('a&nbsp;b')).toBe('a b');
  });

  // A chain of sequential entity replacements lets one rule consume the output
  // of another, so text that was deliberately escaped upstream decodes twice
  // and becomes live markup again.
  it('decodes entities once, never twice', () => {
    expect(htmlToText('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;');
    expect(htmlToText('&amp;amp;')).toBe('&amp;');
    expect(htmlToText('&amp;quot;')).toBe('&quot;');
  });

  // A pattern that ends a tag at the first `>` stops inside the attribute value
  // and spills the remainder of the tag into the output as text.
  it('does not leak markup when a quoted attribute contains a close bracket', () => {
    const result = htmlToText(
      '<a href="https://example.com" title="a>b">x</a>',
    );

    expect(result).toBe('x');
  });

  it('drops HTML comments rather than leaking their contents', () => {
    const result = htmlToText(
      '<p>Before</p><!-- <b>hidden</b> --><p>After</p>',
    );

    expect(result).toContain('Before');
    expect(result).toContain('After');
    expect(result).not.toContain('hidden');
  });

  it('discards script and style bodies instead of flattening them to text', () => {
    const result = htmlToText(
      '<p>Caption</p><script>alert(1)</script><style>body{color:red}</style>',
    );

    expect(result).toBe('Caption');
  });

  it('strips an unterminated tag', () => {
    const result = htmlToText('<p>Visible</p><div class="x');

    expect(result).toBe('Visible');
  });
});

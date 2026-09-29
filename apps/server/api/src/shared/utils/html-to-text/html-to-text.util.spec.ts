import { htmlToText } from '@api/shared/utils/html-to-text/html-to-text.util';
import { describe, expect, it } from 'vitest';

describe('htmlToText', () => {
  it('converts paragraph tags to double newlines', () => {
    const result = htmlToText('<p>Hello</p><p>World</p>');
    expect(result).toContain('Hello');
    expect(result).toContain('World');
    expect(result).toContain('\n');
  });

  it('converts self-closing br tags', () => {
    const result = htmlToText('Line 1<br/>Line 2');
    expect(result).toBe('Line 1\nLine 2');
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
});

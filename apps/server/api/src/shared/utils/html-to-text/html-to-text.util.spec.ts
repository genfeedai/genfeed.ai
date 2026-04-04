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
});

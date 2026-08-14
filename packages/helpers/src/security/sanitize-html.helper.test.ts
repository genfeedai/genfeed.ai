import { describe, expect, it } from 'vitest';
import { createMarkup, sanitizeHtml } from './sanitize-html.helper';

describe('sanitizeHtml helper', () => {
  it('keeps safe markup and returns empty input unchanged', () => {
    expect(sanitizeHtml('<p>Hello <strong>world</strong></p>')).toBe(
      '<p>Hello <strong>world</strong></p>',
    );
    expect(sanitizeHtml('')).toBe('');
  });

  it('discards script, form, and iframe payloads that a denylist would miss', () => {
    const result = sanitizeHtml(
      '<p>Safe</p><scr<script>ipt>alert(1)</script><form action="https://evil.example"><input name="pw"></form><iframe src="https://evil.example"></iframe>',
    );

    expect(result).toContain('<p>Safe</p>');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('ipt>');
    expect(result).not.toContain('<form');
    expect(result).not.toContain('<input');
    expect(result).not.toContain('<iframe');
  });

  it('strips event handlers and javascript: schemes', () => {
    const result = sanitizeHtml(
      '<img/onerror=alert(1) src=x><a href="   javascript:alert(1)">x</a><a href="https://example.com" target="_blank">ok</a>',
    );

    expect(result).not.toContain('onerror');
    expect(result).not.toContain('javascript:');
    expect(result).toContain('<a>x</a>');
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it('wraps sanitized HTML for dangerouslySetInnerHTML', () => {
    expect(createMarkup('<p>Hi</p><script>alert(1)</script>')).toEqual({
      __html: '<p>Hi</p>',
    });
  });
});

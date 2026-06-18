import { createMarkup, sanitizeHtml } from '@utils/sanitize-html';
import { describe, expect, it } from 'vitest';

describe('sanitize-html', () => {
  describe('sanitizeHtml', () => {
    it('should return sanitized HTML string', () => {
      const result = sanitizeHtml('<p>Hello</p>');
      expect(result).toBe('<p>Hello</p>');
    });

    it('should strip script tags', () => {
      const result = sanitizeHtml('<p>Safe</p><script>alert("xss")</script>');
      expect(result).not.toContain('<script>');
      expect(result).toContain('<p>Safe</p>');
    });

    it('should strip event handlers', () => {
      const result = sanitizeHtml('<img onerror="alert(1)" src="x.jpg">');
      expect(result).not.toContain('onerror');
    });

    it('should strip unquoted and single-quoted event handlers', () => {
      const result = sanitizeHtml(
        '<img onerror=alert(1) onload=\'alert(2)\' src="x.jpg">',
      );

      expect(result).not.toContain('onerror');
      expect(result).not.toContain('onload');
      expect(result).toContain('src="x.jpg"');
    });

    it('should strip blocked elements and their content', () => {
      const result = sanitizeHtml(
        '<p>Safe</p><iframe src="https://example.com"></iframe><style>body{display:none}</style>',
      );

      expect(result).toBe('<p>Safe</p>');
    });

    it('should strip unsafe URL protocols', () => {
      const result = sanitizeHtml(
        '<a href="java&#x73;cript:alert(1)">bad</a><a href="https://example.com">good</a>',
      );

      expect(result).toBe('<a>bad</a><a href="https://example.com">good</a>');
    });

    it('should strip style and srcdoc attributes', () => {
      const result = sanitizeHtml(
        '<div style="color:red"><iframe srcdoc="<p>x</p>"></iframe><p>Text</p></div>',
      );

      expect(result).toBe('<div><p>Text</p></div>');
    });

    it('should handle empty string', () => {
      const result = sanitizeHtml('');
      expect(result).toBe('');
    });

    it('should preserve safe HTML elements', () => {
      const html = '<p>Hello <strong>world</strong></p>';
      const result = sanitizeHtml(html);
      expect(result).toBe(html);
    });
  });

  describe('createMarkup', () => {
    it('should return object with __html property', () => {
      const result = createMarkup('<p>Test</p>');
      expect(result).toHaveProperty('__html');
    });

    it('should sanitize the HTML before wrapping', () => {
      const result = createMarkup('<p>Hi</p><script>alert("xss")</script>');
      expect(result.__html).not.toContain('<script>');
      expect(result.__html).toContain('<p>Hi</p>');
    });

    it('should handle empty string', () => {
      const result = createMarkup('');
      expect(result).toEqual({ __html: '' });
    });
  });
});

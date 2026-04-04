import { describe, expect, it, vi } from 'vitest';

vi.mock('isomorphic-dompurify', () => ({
  default: {
    sanitize: (html: string) => {
      // Simulate DOMPurify: strip script tags and event handlers
      return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/\s*on\w+="[^"]*"/gi, '');
    },
  },
}));

import { createMarkup, sanitizeHtml } from '@utils/sanitize-html';

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

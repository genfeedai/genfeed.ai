import { describe, expect, it } from 'vitest';
import { createMarkup, sanitizeHtml } from './sanitize-html.helper';

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

    it('should strip unsafe URL protocols hidden behind named entities and whitespace', () => {
      const result = sanitizeHtml(
        '<a href="java&Tab;script&colon;alert(1)">bad</a><a href="vbscript&colon;msgbox(1)">also bad</a>',
      );

      expect(result).toBe('<a>bad</a><a>also bad</a>');
    });

    it('should drop only the unsafe candidates from a srcset', () => {
      const result = sanitizeHtml(
        '<img srcset="https://example.com/a.jpg 1x, java&#x73;cript:alert(1) 2x" src="https://example.com/a.jpg">',
      );

      expect(result).toContain('src="https://example.com/a.jpg"');
      expect(result).toContain('srcset="https://example.com/a.jpg 1x"');
      expect(result).not.toContain('cript:alert');
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

  // Every payload below defeats a regex-based sanitizer, because each one is
  // tokenized differently by a pattern than by an HTML parser. They are the
  // reason this module delegates to a parser.
  describe('sanitizeHtml — payloads that evade pattern matching', () => {
    // A single strip pass over `<scr<script>ipt>` removes the inner `<script>`
    // and rejoins the halves into a live element. A parser never does, and what
    // is left over is inert escaped text.
    it('should not reassemble a script tag split across a strip pass', () => {
      const result = sanitizeHtml('<scr<script>ipt>alert(1)</script>');

      expect(result).not.toContain('<script');
      expect(result).not.toContain('ipt>');
    });

    it('should strip an event handler with no whitespace before it', () => {
      const result = sanitizeHtml('<img/onerror=alert(1) src=x>');

      expect(result).not.toContain('onerror');
      expect(result).not.toContain('alert');
    });

    it('should strip a handler that follows a > inside a quoted attribute', () => {
      const result = sanitizeHtml(
        '<div title="a>b" onclick=alert(1)>text</div>',
      );

      expect(result).not.toContain('onclick');
      expect(result).not.toContain('alert');
      expect(result).toContain('text');
    });

    it('should discard an unterminated script element and its content', () => {
      const result = sanitizeHtml('<p>Safe</p><script>alert(1)');

      expect(result).toBe('<p>Safe</p>');
    });

    it('should strip elements that no denylist enumerated', () => {
      const result = sanitizeHtml(
        '<form action="https://evil.example"><input name="pw"><button formaction="https://evil.example">go</button></form>',
      );

      expect(result).not.toContain('<form');
      expect(result).not.toContain('<input');
      expect(result).not.toContain('<button');
      expect(result).not.toContain('formaction');
    });

    it('should strip a base element that would rewrite every relative URL', () => {
      const result = sanitizeHtml(
        '<base href="https://evil.example/"><p>x</p>',
      );

      expect(result).toBe('<p>x</p>');
    });

    it('should discard script content nested inside foreign-content elements', () => {
      const result = sanitizeHtml(
        '<svg><script>alert(1)</script></svg><math><mtext><script>alert(2)</script></mtext></math>',
      );

      expect(result).not.toContain('<script');
      expect(result).not.toContain('alert(1)');
      expect(result).not.toContain('alert(2)');
    });

    it('should not resurrect markup hidden inside an HTML comment', () => {
      const result = sanitizeHtml('<!--<script>alert(1)</script>--><p>x</p>');

      expect(result).not.toContain('<script');
      expect(result).not.toContain('alert(1)');
      expect(result).toContain('<p>x</p>');
    });

    it('should reject a data: URI in an href', () => {
      const result = sanitizeHtml(
        '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
      );

      expect(result).toBe('<a>x</a>');
    });

    it('should reject a javascript: scheme padded with leading whitespace', () => {
      const result = sanitizeHtml('<a href="   javascript:alert(1)">x</a>');

      expect(result).toBe('<a>x</a>');
    });

    it('should reject a javascript: scheme in a video poster', () => {
      const result = sanitizeHtml(
        '<video poster="javascript:alert(1)" src="https://example.com/v.mp4"></video>',
      );

      expect(result).not.toContain('poster');
      expect(result).toContain('src="https://example.com/v.mp4"');
    });

    it('should keep mailto and tel schemes', () => {
      const result = sanitizeHtml(
        '<a href="mailto:hi@example.com">mail</a><a href="tel:+15551234">call</a>',
      );

      expect(result).toBe(
        '<a href="mailto:hi@example.com">mail</a><a href="tel:+15551234">call</a>',
      );
    });

    it('should sever the opener reference on links that open a new tab', () => {
      const result = sanitizeHtml(
        '<a href="https://example.com" target="_blank">x</a>',
      );

      expect(result).toContain('rel="noopener noreferrer"');
    });

    it('should preserve heading anchors and classes used by article content', () => {
      const result = sanitizeHtml(
        '<h2 id="section-one" class="gen-heading">Title</h2>',
      );

      expect(result).toBe(
        '<h2 id="section-one" class="gen-heading">Title</h2>',
      );
    });

    it('should normalize uppercase tags rather than letting them through', () => {
      const result = sanitizeHtml('<P>ok</P><SCRIPT>alert(1)</SCRIPT>');

      expect(result).toBe('<p>ok</p>');
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

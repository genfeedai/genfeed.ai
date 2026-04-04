import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML using DOMPurify — safe for both server and client.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html);
}

/**
 * Safe wrapper for dangerouslySetInnerHTML.
 */
export function createMarkup(html: string): { __html: string } {
  return { __html: sanitizeHtml(html) };
}

import { sanitizeHtml } from '@genfeedai/helpers';
import { marked } from 'marked';

/**
 * Newsletter bodies are authored as Markdown. Every surface that ships an
 * issue as HTML — the Substack import feed and Beehiiv delivery — renders it
 * through this one sanitized conversion so readers see the same issue.
 */
export function renderNewsletterHtml(markdown: string): string {
  return sanitizeHtml(marked.parse(markdown, { async: false }));
}

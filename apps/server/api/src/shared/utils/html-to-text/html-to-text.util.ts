/**
 * HTML to Plain Text Utility
 * Converts HTML content to plain text while preserving line breaks
 * Used for converting rich text editor output to platform-compatible text
 */

/**
 * Converts HTML to plain text, preserving line breaks
 * - Strips all HTML tags
 * - Converts block elements (<p>, <div>) to newlines
 * - Converts <br> and <br/> to newlines
 * - Preserves text content
 * - Trims extra whitespace
 *
 * @param html - HTML string to convert
 * @returns Plain text with preserved line breaks
 *
 * @example
 * htmlToText('<p>Hello</p><p>World</p>') // Returns: 'Hello\n\nWorld'
 * htmlToText('Line 1<br>Line 2') // Returns: 'Line 1\nLine 2'
 * htmlToText('<p>Text with <strong>bold</strong> content</p>') // Returns: 'Text with bold content'
 */
export function htmlToText(html: string | null | undefined): string {
  if (!html) {
    return '';
  }

  let text = html;

  // Convert block-level elements to newlines (with double newline for spacing)
  // Handle both opening and self-closing tags
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');

  // Convert line breaks to newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

  // Normalize whitespace
  // Replace multiple spaces with single space
  text = text.replace(/[ \t]+/g, ' ');

  // Replace multiple newlines (3+) with double newline
  text = text.replace(/\n{3,}/g, '\n\n');

  // Trim each line and remove empty lines at start/end
  const lines = text.split('\n').map((line) => line.trim());
  text = lines.join('\n').trim();

  return text;
}

import type { AgentDraftSuggestionPayload } from '@genfeedai/agent';
import { plainTextToHtml } from '@helpers/security/sanitize-html.helper';

const HTML_SPECIAL_CHARACTERS: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};
const HTML_SPECIAL_CHARACTERS_PATTERN = /[&<>]/g;

function escapeInlineText(value: string): string {
  return value.replace(
    HTML_SPECIAL_CHARACTERS_PATTERN,
    (character) => HTML_SPECIAL_CHARACTERS[character] ?? character,
  );
}

/**
 * Applies text the agent wrote to a post body (HTML). A post is short, so a
 * suggestion replaces the whole body; with text selected in the editor, it
 * replaces only that selection.
 */
export function applyAgentTextToPost(
  currentHtml: string,
  payload: AgentDraftSuggestionPayload,
): string {
  const selectedText = payload.selectedText?.trim();
  const escapedSelection = selectedText ? escapeInlineText(selectedText) : '';

  if (
    payload.mode === 'replace-selection' &&
    escapedSelection &&
    currentHtml.includes(escapedSelection)
  ) {
    return currentHtml.replace(escapedSelection, () =>
      escapeInlineText(payload.text.trim()),
    );
  }

  return plainTextToHtml(payload.text);
}

/** `SCENE:` / `NEGATIVE:` style block labels the orchestrator emits. */
const STRUCTURED_PROMPT_LABEL = /[A-Z][A-Z0-9/&()' -]{1,40}:[ \t\n]/.source;

/**
 * Put a blank line before every structured block label.
 *
 * Idempotent by construction: both break rules require a non-newline character
 * immediately before the break, so a prompt that already has its blank lines is
 * returned untouched.
 *
 * The previous `([^\n])\s+(LABEL)` rule was not idempotent — `\s+` matched
 * across the `\n\n` the orchestrator had already written and the replacement
 * emitted a single `\n`, so well-formed prompts were flattened into a wall of
 * text on the way to the composer textarea.
 */
export function formatStructuredPrompt(prompt: string): string {
  if (!prompt.trim()) {
    return prompt;
  }

  return (
    prompt
      // Literal "\n" escapes survive some provider round-trips.
      .replace(/\\n/g, '\n')
      // Run-on: "...end of sentence. LABEL: ..." — consume inline whitespace only.
      .replace(
        new RegExp(`([^\\n])[ \\t]+(?=${STRUCTURED_PROMPT_LABEL})`, 'g'),
        '$1\n\n',
      )
      // Single newline before a label — promote it to a blank line.
      .replace(
        new RegExp(`([^\\n])\\n(?=${STRUCTURED_PROMPT_LABEL})`, 'g'),
        '$1\n\n',
      )
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * Used when no `prompt.post.enhancement` template row exists, so AI Rewrite
 * does not depend on a template that only lives in the database.
 */
export const DEFAULT_POST_ENHANCEMENT_PROMPT = `Rewrite the {{platform}} post below according to the request.

Current post:
{{currentDescription}}

Request:
{{userRequest}}

Tone: {{tone}}

Return only the rewritten post text, with no preface or explanation.`;

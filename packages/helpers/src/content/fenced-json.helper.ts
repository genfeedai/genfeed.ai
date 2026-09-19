/**
 * A markdown code fence is transport, not content.
 *
 * Providers that cannot be told to answer in JSON — a self-hosted model behind
 * a desktop install, a chat model proxied by Replicate — routinely wrap an
 * otherwise perfect answer in one. Unwrapping it here keeps the payload intact
 * so a schema, rather than a regex, decides whether the answer is usable.
 * Routes that can enforce a JSON schema never need this.
 *
 * CommonMark allows three *or more* backticks or tildes, an optional info
 * string, and surrounding prose, so all of those are accepted: a helper that
 * only understood ```` ```json ```` would reject valid answers for the shape
 * of their wrapper.
 */
const FENCED_BLOCK =
  /(?:^|\n)[ \t]*(`{3,}|~{3,})[ \t]*[A-Za-z0-9_+-]*[ \t]*\r?\n?([\s\S]*?)\r?\n?[ \t]*\1[ \t]*(?=\r?\n|$)/;

export function unwrapFencedJson(raw: string): string {
  const trimmed = raw.trim();

  return FENCED_BLOCK.exec(trimmed)?.[2]?.trim() ?? trimmed;
}

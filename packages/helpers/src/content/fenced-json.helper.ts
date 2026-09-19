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
 *
 * The closing fence must use the same character and be *at least* as long as
 * the opening one. A longer close is legal, and requiring an exact match does
 * not merely miss it — the backreference matches the opening length and leaves
 * the surplus markers sitting in the payload. Backticks and tildes therefore
 * get one branch each, so a run of one can never close a fence opened with the
 * other: group 1/2 is the backtick form, group 3/4 the tilde form.
 */
const FENCED_BLOCK =
  /(?:^|\n)[ \t]*(?:(`{3,})[ \t]*[A-Za-z0-9_+-]*[ \t]*\r?\n?([\s\S]*?)\r?\n?[ \t]*\1`*|(~{3,})[ \t]*[A-Za-z0-9_+-]*[ \t]*\r?\n?([\s\S]*?)\r?\n?[ \t]*\3~*)[ \t]*(?=\r?\n|$)/;

export function unwrapFencedJson(raw: string): string {
  const trimmed = raw.trim();
  const match = FENCED_BLOCK.exec(trimmed);

  return (match?.[2] ?? match?.[4])?.trim() ?? trimmed;
}

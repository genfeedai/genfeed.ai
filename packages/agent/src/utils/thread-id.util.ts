/**
 * A thread id is renderable/navigable only when it is a non-empty string
 * that is not a stringified nullish value. Stringified "undefined"/"null"
 * appear when a bad href (e.g. /agent/undefined) round-trips through the
 * router back into a thread id param.
 */
export function isRenderableThreadId(
  threadId: string | null | undefined,
): threadId is string {
  return (
    typeof threadId === 'string' &&
    threadId.trim().length > 0 &&
    threadId !== 'undefined' &&
    threadId !== 'null'
  );
}

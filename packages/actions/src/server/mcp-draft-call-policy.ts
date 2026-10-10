const DRAFT_FIELDS = new Set([
  'brandId',
  'caption',
  'content',
  'textContent',
  'mediaUrls',
  'platform',
  'platforms',
  'visibility',
]);

/** Only the bounded standalone text-draft branch can skip paid consent. */
export function isMcpTextDraftCall(
  arguments_: Record<string, unknown>,
): boolean {
  if (Object.keys(arguments_).some((key) => !DRAFT_FIELDS.has(key)))
    return false;
  return (
    typeof arguments_.content === 'string' &&
    arguments_.content.trim().length > 0
  );
}

/**
 * The post detail screen's in-flight saves (#9741), held as one set instead
 * of one boolean per control. Operations still run in parallel as before;
 * this file names them and decides, in one place, which ones block publishing.
 */
export const POST_DETAIL_OPERATIONS = [
  'update',
  'save-ingredients',
  'save-description',
  'save-schedule',
  'toggle-grok',
  'toggle-first-comment',
  'expand-to-thread',
] as const;

export type PostDetailOperation = (typeof POST_DETAIL_OPERATIONS)[number];

export type PostDetailPendingOperations = ReadonlySet<PostDetailOperation>;

/**
 * Operations that disable Schedule and Publish now. Today only a schedule or
 * publish save does; other saves keep the buttons available.
 */
export const POST_DETAIL_PUBLISH_BLOCKING_OPERATIONS: readonly PostDetailOperation[] =
  ['save-schedule'];

export function setPostDetailOperation(
  pending: PostDetailPendingOperations,
  operation: PostDetailOperation,
  isActive: boolean,
): PostDetailPendingOperations {
  if (pending.has(operation) === isActive) {
    return pending;
  }
  const next = new Set(pending);
  if (isActive) {
    next.add(operation);
  } else {
    next.delete(operation);
  }
  return next;
}

export function isPostDetailPublishBlocked(
  pending: PostDetailPendingOperations,
): boolean {
  return POST_DETAIL_PUBLISH_BLOCKING_OPERATIONS.some((operation) =>
    pending.has(operation),
  );
}

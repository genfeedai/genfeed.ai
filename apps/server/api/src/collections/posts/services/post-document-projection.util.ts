import type { PostDocument } from '@api/collections/posts/post.schema';
import {
  isExtensionPublicationCapture,
  resolveExtensionPublicationObservedVisibility,
} from '@api/collections/posts/services/post-publication-capture.util';
import { PostVisibility, TargetExecutionState } from '@genfeedai/contracts';
import {
  projectLegacyPostStatus,
  resolvePostVisibility,
} from '@genfeedai/contracts/api-types/contracts/scheduler.contract';

export function normalizePostDocument(document: unknown): PostDocument {
  const post = document as PostDocument;
  const persistedState = post.targetExecutionState as TargetExecutionState;
  const targetExecutionState = Object.values(TargetExecutionState).includes(
    persistedState,
  )
    ? persistedState
    : TargetExecutionState.DRAFT;
  const captureVisibility = resolveExtensionPublicationObservedVisibility(
    post.visibility,
  );
  const visibility = isExtensionPublicationCapture(post)
    ? captureVisibility === 'unknown'
      ? null
      : resolvePostVisibility(captureVisibility)
    : resolvePostVisibility(post.visibility);
  return {
    ...post,
    status: projectLegacyPostStatus(
      targetExecutionState,
      visibility ?? PostVisibility.PUBLIC,
    ),
    targetExecutionState,
    visibility,
  };
}

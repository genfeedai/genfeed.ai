import type { WorkflowNode } from '@genfeedai/types';

/**
 * Extract the scalar output value that corresponds to a specific handle type.
 *
 * This intentionally mirrors the existing connection-validation behavior and
 * only considers the singular output fields for each media type.
 */
export function getNodeOutputForHandle(
  node: WorkflowNode,
  handleType: string | null | undefined,
): string | undefined {
  const data = node.data as Record<string, unknown>;

  if (handleType === 'text') {
    return typeof data.outputText === 'string'
      ? data.outputText
      : typeof data.prompt === 'string'
        ? data.prompt
        : undefined;
  }

  if (handleType === 'image') {
    return typeof data.outputImage === 'string'
      ? data.outputImage
      : typeof data.image === 'string'
        ? data.image
        : undefined;
  }

  if (handleType === 'video') {
    return typeof data.outputVideo === 'string'
      ? data.outputVideo
      : typeof data.video === 'string'
        ? data.video
        : undefined;
  }

  if (handleType === 'audio') {
    return typeof data.outputAudio === 'string'
      ? data.outputAudio
      : typeof data.audio === 'string'
        ? data.audio
        : undefined;
  }

  return undefined;
}

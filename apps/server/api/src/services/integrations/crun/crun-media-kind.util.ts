/** Frozen routes remain available for reconciliation after operator disablement. */
export function getCrunMediaKind(endpoint: string): 'image' | 'video' | null {
  switch (endpoint) {
    case 'google/nano-banana-pro':
    case 'bytedance/seedream-4-5':
      return 'image';
    case 'kling/v2-5-turbo-pro':
    case 'google/veo3-1-fast-t2v':
      return 'video';
    default:
      return null;
  }
}

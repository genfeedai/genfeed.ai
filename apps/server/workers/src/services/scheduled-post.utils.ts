import type { PostEntity } from '@api/collections/posts/entities/post.entity';

export function readPostString(
  post: PostEntity,
  keys: readonly string[],
): string | undefined {
  const record = post as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (value && typeof value === 'object' && 'id' in value) {
      const id = (value as { id?: unknown }).id;
      if (typeof id === 'string' && id.length > 0) {
        return id;
      }
    }
  }

  return undefined;
}

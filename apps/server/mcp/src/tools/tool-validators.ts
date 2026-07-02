import { Platform, PostStatus } from '@genfeedai/enums';

const PLATFORM_VALUES = new Set<string>(Object.values(Platform));
const POST_STATUS_VALUES = new Set<string>(Object.values(PostStatus));

export function isPlatform(value: string): value is Platform {
  return PLATFORM_VALUES.has(value);
}

export function toPlatform(value: unknown): Platform | undefined {
  return typeof value === 'string' && isPlatform(value) ? value : undefined;
}

export function toPostStatus(value: unknown): PostStatus | undefined {
  return typeof value === 'string' && POST_STATUS_VALUES.has(value)
    ? (value as PostStatus)
    : undefined;
}

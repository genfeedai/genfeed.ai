/** Lifetime of a tag epoch: longer than any response fill it has to outlive. */
export const TAG_EPOCH_TTL_SECONDS = 24 * 60 * 60;

/**
 * The counter an invalidation bumps. A fill that read the counter before it
 * computed a value stores that value only while the counter is unchanged.
 */
export const tagEpochKey = (tag: string): string => `tag-epoch:${tag}`;

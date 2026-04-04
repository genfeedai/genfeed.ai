/**
 * Cache decorator target (class method or property)
 * Represents the object being decorated
 */
export interface CacheDecoratorTarget {
  [key: string]: unknown;
}

/**
 * Cached method arguments type
 * Arguments passed to cached methods
 */
export type CachedMethodArgs = unknown[];

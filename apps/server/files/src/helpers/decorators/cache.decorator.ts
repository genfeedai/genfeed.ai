/**
 * No-op method decorator. Accepts cache options for signature compatibility
 * but does not perform any caching — the original method runs unconditionally.
 */
export interface CacheOptions {
  ttl?: number;
  keyGenerator?: (...args: unknown[]) => string;
  cacheType?: unknown;
}

export function CacheResult(options?: CacheOptions): MethodDecorator {
  return (
    _target: unknown,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    void options;
    return descriptor;
  };
}

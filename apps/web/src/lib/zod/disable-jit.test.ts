import { describe, expect, it, vi } from 'vitest';

describe('disable-jit', () => {
  it('builds and parses schemas without evaluating a string as code', async () => {
    vi.resetModules();
    const evaluated: unknown[][] = [];
    const NativeFunction = globalThis.Function;
    // A strict CSP reports every `new Function(...)`, so count constructions.
    const CountingFunction = new Proxy(NativeFunction, {
      construct(target, args) {
        evaluated.push(args);
        return Reflect.construct(target, args);
      },
    });
    vi.stubGlobal('Function', CountingFunction);

    try {
      await import('./disable-jit');
      const { z } = await import('zod');
      const schema = z.object({ handle: z.string(), count: z.number() });

      expect(schema.parse({ count: 2, handle: 'genfeed' })).toEqual({
        count: 2,
        handle: 'genfeed',
      });
      expect(evaluated).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

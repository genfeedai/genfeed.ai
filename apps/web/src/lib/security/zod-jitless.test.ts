import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('zod jitless', () => {
  const functionCalls: string[][] = [];
  const NativeFunction = globalThis.Function;

  beforeEach(() => {
    functionCalls.length = 0;
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Zod's compiler probes with `Function("")` the first time an object schema
   * is built. A strict CSP reports that probe as a violation, so the count of
   * `Function` calls while schemas are built and parsed is what the browser
   * sees.
   */
  function countFunctionConstructions(): void {
    const Spy = new Proxy(NativeFunction, {
      apply(target, thisArg, args: string[]) {
        functionCalls.push(args);
        return Reflect.apply(target, thisArg, args);
      },
      construct(target, args: string[], newTarget) {
        functionCalls.push(args);
        return Reflect.construct(target, args, newTarget);
      },
    });
    vi.stubGlobal('Function', Spy);
  }

  it('builds and parses object schemas without constructing a Function', async () => {
    await import('./zod-jitless');
    const { z } = await import('zod');
    countFunctionConstructions();

    const schema = z.object({ handle: z.string(), count: z.number() });
    const result = schema.safeParse({ count: 2, handle: 'shayla' });

    expect(result).toEqual({
      data: { count: 2, handle: 'shayla' },
      success: true,
    });
    expect(functionCalls).toEqual([]);
  });

  it('still rejects invalid input', async () => {
    await import('./zod-jitless');
    const { z } = await import('zod');

    const result = z.object({ count: z.number() }).safeParse({ count: 'two' });

    expect(result.success).toBe(false);
  });

  it('is the first import of the browser instrumentation entry', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const source = readFileSync(
      join(process.cwd(), 'instrumentation-client.ts'),
      'utf8',
    );
    const firstImport = source.match(/^import .*$/m)?.[0];

    expect(firstImport).toBe("import '@/lib/security/zod-jitless';");
  });
});

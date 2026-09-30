import { describe, expect, it } from 'vitest';
import {
  analyzeSmokeTests,
  isEligibleTestPath,
  pruneSource,
} from './prune-redundant-tests';

const FILE =
  'apps/server/api/src/collections/folders/services/folders.service.spec.ts';

function suite(smoke: string, witness: string): string {
  return `describe('Service', () => {
    let service;
    beforeEach(() => { service = buildService(); });
    ${smoke}
    ${witness}
  });`;
}

const SMOKE = `it('is defined', () => { expect(service).toBeDefined(); });`;
const WITNESS = `it('returns folders', async () => {
  const result = await service.findAll();
  expect(result).toEqual(['folder']);
});`;

describe('conservative smoke pruning', () => {
  it('records a retained same-suite method/assertion witness and source lines', () => {
    const result = analyzeSmokeTests(FILE, suite(SMOKE, WITNESS));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      subject: 'service',
      title: 'is defined',
      witness: 'returns folders',
    });
    expect(result[0]?.line).toBeGreaterThan(0);
    expect(result[0]?.witnessLine).toBeGreaterThan(result[0]?.line ?? 0);
  });

  it('preserves different assertions on the same executed code', () => {
    const source = suite(
      `it('pins the value', () => { expect(service.amount).toBe(7); });`,
      WITNESS,
    );
    expect(analyzeSmokeTests(FILE, source)).toEqual([]);
    expect(pruneSource(FILE, source).source).toBe(source);
  });

  it('preserves empty tests and invocation-only tests', () => {
    const source = suite(
      `it('runs', () => { service.findAll(); }); it('empty', () => {});`,
      WITNESS,
    );
    expect(analyzeSmokeTests(FILE, source)).toEqual([]);
  });

  it('preserves smoke bodies with setup, calls, or more than one assertion', () => {
    for (const body of [
      'const value = service; expect(value).toBeDefined();',
      'service.start(); expect(service).toBeDefined();',
      'expect(service).toBeDefined(); expect(service.ready).toBe(true);',
      'expect(createService()).toBeDefined();',
    ]) {
      expect(
        analyzeSmokeTests(
          FILE,
          suite(`it('smoke', () => { ${body} });`, WITNESS),
        ),
      ).toEqual([]);
    }
  });

  it('requires an unconditional fixture reset before each test', () => {
    const source = suite(SMOKE, WITNESS);
    expect(
      analyzeSmokeTests(FILE, source.replace('beforeEach', 'beforeAll')),
    ).toEqual([]);
    expect(
      analyzeSmokeTests(
        FILE,
        source.replace(
          'service = buildService();',
          'if (enabled) service = buildService();',
        ),
      ),
    ).toEqual([]);
    expect(
      analyzeSmokeTests(
        FILE,
        source.replace(
          'service = buildService();',
          'if (enabled) return; service = buildService();',
        ),
      ),
    ).toEqual([]);
  });

  it('rejects reset-hook local fixtures rather than mistaking them for suite fixtures', () => {
    for (const setup of [
      'let service; service = buildService();',
      'const { service } = buildHarness(); service = buildService();',
    ])
      expect(
        analyzeSmokeTests(
          FILE,
          suite(SMOKE, WITNESS).replace('service = buildService();', setup),
        ),
      ).toEqual([]);
    expect(
      analyzeSmokeTests(
        FILE,
        suite(SMOKE, WITNESS).replace(
          'beforeEach(() =>',
          'beforeEach((service) =>',
        ),
      ),
    ).toEqual([]);
  });

  it('rejects conditional or order-dependent lifecycle setup in every applicable hook', () => {
    for (const setup of [
      'service = ++counter === 1 ? undefined : buildService();',
      'service = enabled && buildService();',
      'service = buildService(); counter++;',
      'counter += 1; service = fixtures[counter];',
      'counter = counter + 1; service = fixtures[counter];',
      'state.count = state.count + 1; service = fixtures[state.count];',
    ])
      expect(
        analyzeSmokeTests(
          FILE,
          suite(SMOKE, WITNESS).replace('service = buildService();', setup),
        ),
      ).toEqual([]);
    const contextHook = `beforeEach(({ task }) => { if (task.name === 'returns folders') service = buildService(); });`;
    expect(
      analyzeSmokeTests(
        FILE,
        suite(SMOKE, WITNESS).replace(
          'let service;',
          `let service; ${contextHook}`,
        ),
      ),
    ).toEqual([]);
    expect(
      analyzeSmokeTests(FILE, `${contextHook} ${suite(SMOKE, WITNESS)}`),
    ).toEqual([]);
    expect(
      analyzeSmokeTests(
        FILE,
        `describe('parent', () => { ${contextHook} ${suite(SMOKE, WITNESS)} });`,
      ),
    ).toEqual([]);
  });

  it('does not use skipped or conditional tests as witnesses', () => {
    for (const witness of [
      WITNESS.replace("it('returns", "it.skip('returns"),
      `it('conditional', () => { if (enabled) { expect(service.findAll()).toEqual([]); } });`,
    ]) {
      expect(analyzeSmokeTests(FILE, suite(SMOKE, witness))).toEqual([]);
    }
  });

  it('does not use a nested suite or a different subject as a witness', () => {
    expect(
      analyzeSmokeTests(
        FILE,
        suite(SMOKE, `describe('nested', () => { ${WITNESS} });`),
      ),
    ).toEqual([]);
    expect(
      analyzeSmokeTests(
        FILE,
        suite(SMOKE, WITNESS.replace('service.findAll', 'other.findAll')),
      ),
    ).toEqual([]);
  });

  it('rejects witnesses that replace or shadow the fixture', () => {
    for (const setup of [
      'const service = buildService();',
      'const { service } = buildHarness();',
      'const [service] = buildHarness();',
      'const { nested: { service } } = buildHarness();',
      'service = buildService();',
      'service ??= buildService();',
      'service++;',
      '++service;',
      '({ service } = buildHarness());',
    ]) {
      expect(
        analyzeSmokeTests(
          FILE,
          suite(
            SMOKE,
            WITNESS.replace('const result', `${setup} const result`),
          ),
        ),
      ).toEqual([]);
    }
  });

  it('requires an actual immediate method call and a meaningful assertion', () => {
    for (const witness of [
      `it('reference', () => { expect(service.findAll).toBeDefined(); });`,
      `it('later', () => { const later = () => service.findAll(); expect(later).toBeTruthy(); });`,
      `it('no assertion', () => { service.findAll(); });`,
    ]) {
      expect(analyzeSmokeTests(FILE, suite(SMOKE, witness))).toEqual([]);
    }
  });

  it('does not use short-circuit or optional method calls as witnesses', () => {
    for (const witness of [
      `it('conditional call', () => { false && service.findAll(); expect(true).toBe(true); });`,
      `it('optional call', () => { const result = service?.findAll(); expect(result).toEqual([]); });`,
    ])
      expect(analyzeSmokeTests(FILE, suite(SMOKE, witness))).toEqual([]);
  });

  it('preserves suites with test-count-sensitive lifecycle assertions', () => {
    const source = suite(SMOKE, WITNESS).replace(
      'let service;',
      `let service; afterEach(() => { expect(counter).toBe(2); });`,
    );
    expect(analyzeSmokeTests(FILE, source)).toEqual([]);
    expect(
      analyzeSmokeTests(
        FILE,
        `afterEach(() => { expect(counter).toBe(2); }); ${suite(SMOKE, WITNESS)}`,
      ),
    ).toEqual([]);
  });

  it('preserves conditional, skipped, and parameterized suite registration', () => {
    for (const source of [
      suite(SMOKE, WITNESS).replace('describe(', 'describe.skip('),
      `if (enabled) { ${suite(SMOKE, WITNESS)} }`,
      suite(SMOKE, WITNESS).replace('describe(', 'describe.skipIf(enabled)('),
    ])
      expect(analyzeSmokeTests(FILE, source)).toEqual([]);
  });

  it('does not mistake deferred generator bodies for executed callbacks', () => {
    for (const callback of ['function* ()', 'async function* ()']) {
      expect(
        analyzeSmokeTests(
          FILE,
          suite(SMOKE, WITNESS.replace('async () =>', callback)),
        ),
      ).toEqual([]);
      expect(
        analyzeSmokeTests(
          FILE,
          suite(SMOKE, WITNESS).replace(
            'beforeEach(() =>',
            `beforeEach(${callback}`,
          ),
        ),
      ).toEqual([]);
      expect(
        analyzeSmokeTests(
          FILE,
          suite(SMOKE, WITNESS).replace(
            "describe('Service', () =>",
            `describe('Service', ${callback}`,
          ),
        ),
      ).toEqual([]);
    }
  });

  it('rejects named callbacks that can bind their own fixture name', () => {
    expect(
      analyzeSmokeTests(
        FILE,
        suite(
          SMOKE,
          WITNESS.replace('async () =>', 'async function service()'),
        ),
      ),
    ).toEqual([]);
    expect(
      analyzeSmokeTests(
        FILE,
        suite(SMOKE, WITNESS).replace(
          'beforeEach(() =>',
          'beforeEach(function service()',
        ),
      ),
    ).toEqual([]);
  });

  it('does not reinterpret custom or non-Vitest runner bindings', () => {
    for (const binding of [
      `import { expect, it } from 'bun:test';`,
      `import expect from 'vitest';`,
      `import * as expect from 'vitest';`,
      `import { customAssert as expect } from 'vitest';`,
      `const expect = customAssert;`,
      `function beforeEach(callback) { callback(); }`,
    ])
      expect(
        analyzeSmokeTests(FILE, `${binding}\n${suite(SMOKE, WITNESS)}`),
      ).toEqual([]);
  });

  it('fails closed on malformed source', () => {
    expect(() =>
      analyzeSmokeTests(FILE, "describe('broken', () => {"),
    ).toThrow();
  });

  it('preserves everything around the deletion and is idempotent', () => {
    const source = `// preserved header\n${suite(SMOKE, WITNESS)}\n// preserved footer`;
    const first = pruneSource(FILE, source);
    expect(first.source).toContain(WITNESS);
    expect(first.source).toContain('// preserved header');
    expect(first.source).toContain('// preserved footer');
    expect(first.source).not.toContain(SMOKE);
    expect(first.removed).toHaveLength(1);
    expect(pruneSource(FILE, first.source)).toEqual({
      source: first.source,
      removed: [],
    });
  });
});

describe('pruning surface exclusions', () => {
  it('allows ordinary server unit specs', () => {
    expect(isEligibleTestPath(FILE)).toBe(true);
  });

  it('protects active lanes, excluded runners and sensitive business contracts', () => {
    for (const file of [
      'apps/app/demo.test.tsx',
      'packages/ui/demo.test.tsx',
      'packages/agent/demo.spec.ts',
      'packages/workflows/demo.spec.ts',
      'apps/server/workers/demo.spec.ts',
      'scripts/architecture/demo.test.ts',
      'playwright/demo.spec.ts',
      'apps/desktop/app/demo.test.ts',
      'apps/server/api/src/credits/credits.service.spec.ts',
      'apps/server/api/src/auth/auth.service.spec.ts',
      'packages/libs/prisma/tenant-guard.spec.ts',
      'packages/pricing/src/pricing.spec.ts',
      'apps/server/api/src/provider/provider.spec.ts',
      'apps/server/api/src/demo.postgres.spec.ts',
      'apps/server/api/src/demo.e2e-spec.ts',
    ])
      expect(isEligibleTestPath(file)).toBe(false);
  });
});

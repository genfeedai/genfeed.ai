import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCheckTracedDefinitions } from './check-traced-definitions';

describe('check-traced-definitions', () => {
  let testDir = '';

  beforeEach(() => {
    testDir = mkdtempSync(path.join(tmpdir(), 'traced-definitions-'));
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  function write(file: string, content: string): void {
    const target = path.join(testDir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }

  function check(baseline: Record<string, number> = {}) {
    return runCheckTracedDefinitions({ baseline, rootDir: testDir }).violations;
  }

  it('flags an injectable class with untraced async methods', () => {
    write(
      'apps/server/api/src/brands/brands.service.ts',
      `@Injectable()
export class BrandsService {
  async findOne(id: string) { return id; }
  format(id: string) { return id; }
  async onModuleInit() {}
}
`,
    );

    expect(check()).toEqual([
      expect.objectContaining({
        file: 'apps/server/api/src/brands/brands.service.ts',
        kind: 'untraced-class',
        name: 'BrandsService',
      }),
    ]);
  });

  it.each([
    [
      'class-level @Traced()',
      'brands.service.ts',
      '@Traced()\n@Injectable()\nexport class A { async run() {} }\n',
    ],
    [
      'method-level @Traced() and @SentryTraced()',
      'brands.service.ts',
      '@Injectable()\nexport class A {\n  @Traced() async run() {}\n  @SentryTraced() async stop() {}\n}\n',
    ],
    [
      'a controller, spanned by the Sentry Nest integration',
      'brands.controller.ts',
      '@Injectable()\nexport class A { async run() {} }\n',
    ],
    [
      'a class with only lifecycle hooks',
      'brands.service.ts',
      '@Injectable()\nexport class A { async onModuleInit() {} }\n',
    ],
    [
      'a plain class outside a service file',
      'brand.model.ts',
      'export class A { async run() {} }\n',
    ],
    [
      'an exported function defined through traced()',
      'brand.util.ts',
      "export const run = traced('run', async () => 1);\n",
    ],
    [
      'an unexported async function',
      'brand.util.ts',
      'async function run() { return 1; }\nexport const value = run;\n',
    ],
  ])('accepts %s', (_label, file, content) => {
    write(`apps/server/api/src/brands/${file}`, content);

    expect(check()).toEqual([]);
  });

  it('flags exported async functions and arrows that skip traced()', () => {
    write(
      'apps/server/api/src/brands/brand.util.ts',
      `export async function load() { return 1; }
export const save = async () => 2;
export function sync() { return 3; }
`,
    );

    expect(check()).toEqual([
      expect.objectContaining({
        allowed: 0,
        count: 2,
        kind: 'untraced-export',
      }),
    ]);
  });

  it('allows baselined exports and fails when the file gains one', () => {
    write(
      'apps/server/api/src/brands/brand.util.ts',
      'export async function load() { return 1; }\nexport async function save() { return 2; }\n',
    );

    expect(check({ 'apps/server/api/src/brands/brand.util.ts': 2 })).toEqual(
      [],
    );
    expect(check({ 'apps/server/api/src/brands/brand.util.ts': 1 })).toEqual([
      expect.objectContaining({ count: 2, kind: 'untraced-export' }),
    ]);
  });

  it('fails on a stale or shrunken baseline entry', () => {
    write(
      'apps/server/api/src/brands/brand.util.ts',
      'export async function load() { return 1; }\n',
    );

    expect(
      check({
        'apps/server/api/src/brands/brand.util.ts': 2,
        'apps/server/api/src/brands/gone.util.ts': 1,
      }).map((violation) => [violation.file, violation.kind]),
    ).toEqual([
      ['apps/server/api/src/brands/brand.util.ts', 'stale-baseline'],
      ['apps/server/api/src/brands/gone.util.ts', 'stale-baseline'],
    ]);
  });

  it('ignores specs and test utilities', () => {
    write(
      'apps/server/api/src/brands/brands.service.spec.ts',
      'export async function helper() {}\n@Injectable() class A { async run() {} }\n',
    );
    write(
      'apps/server/api/src/brands/brands.test-util.ts',
      'export async function helper() {}\n',
    );

    expect(check()).toEqual([]);
  });
});

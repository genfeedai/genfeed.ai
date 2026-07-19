import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  discoverChangedRuntimeFiles,
  runRuntimeComplexityCheck,
} from './check-runtime-complexity';

describe('check-runtime-complexity', () => {
  let rootDir = '';

  beforeEach(() => {
    rootDir = mkdtempSync(path.join(tmpdir(), 'runtime-complexity-'));
  });

  afterEach(() => {
    rmSync(rootDir, { force: true, recursive: true });
  });

  it('enforces controller and runtime file thresholds', () => {
    const controller = writeFixture(
      'apps/server/api/src/demo/demo.controller.ts',
      classWithPadding('DemoController', 11),
    );
    const service = writeFixture(
      'apps/server/api/src/demo/demo.service.ts',
      classWithPadding('DemoService', 21),
    );

    const result = runRuntimeComplexityCheck({
      files: [controller, service],
      mode: 'changed',
      rootDir,
      thresholds: {
        controllerLines: 10,
        runtimeLines: 20,
      },
    });

    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: controller,
          limit: 10,
          metric: 'file-lines',
        }),
        expect.objectContaining({
          file: service,
          limit: 20,
          metric: 'file-lines',
        }),
      ]),
    );
  });

  it('reports oversized methods with exact symbols and lines', () => {
    const file = writeFixture(
      'packages/libs/demo/demo.service.ts',
      [
        'export class DemoService {',
        '  run(): void {',
        '    const first = 1;',
        '    const second = 2;',
        '    void first;',
        '    void second;',
        '  }',
        '}',
      ].join('\n'),
    );

    const result = runRuntimeComplexityCheck({
      files: [file],
      mode: 'changed',
      rootDir,
      thresholds: { methodLines: 5 },
    });

    expect(result.violations).toContainEqual(
      expect.objectContaining({
        actual: 6,
        file,
        line: 2,
        metric: 'method-lines',
        symbol: 'DemoService.run',
      }),
    );
  });

  it('reports constructor dependency fan-out above the limit', () => {
    const parameters = Array.from(
      { length: 16 },
      (_, index) => `private readonly dependency${index}: unknown`,
    ).join(',\n');
    const file = writeFixture(
      'apps/server/api/src/demo/demo.service.ts',
      [
        'export class DemoService {',
        `  constructor(${parameters}) {}`,
        '}',
      ].join('\n'),
    );

    const result = runRuntimeComplexityCheck({
      files: [file],
      mode: 'changed',
      rootDir,
    });

    expect(result.violations).toContainEqual(
      expect.objectContaining({
        actual: 16,
        limit: 15,
        metric: 'constructor-dependencies',
        symbol: 'DemoService.constructor',
      }),
    );
  });

  it('passes metrics exactly at every threshold', () => {
    const file = writeFixture(
      'apps/server/api/src/demo/demo.controller.ts',
      [
        'export class DemoController {',
        '  constructor(private readonly dependency: unknown) {}',
        '  run(): void {',
        '    return;',
        '  }',
        '}',
      ].join('\n'),
    );

    const result = runRuntimeComplexityCheck({
      files: [file],
      mode: 'changed',
      rootDir,
      thresholds: {
        constructorDependencies: 1,
        controllerLines: 6,
        methodLines: 3,
      },
    });

    expect(result.violations).toEqual([]);
  });

  it('allows unchanged legacy violations in changed mode', () => {
    const file = writeFixture(
      'apps/server/api/src/demo/demo.service.ts',
      classWithPadding('DemoService', 10),
    );
    const baselineFiles = runRuntimeComplexityCheck({
      files: [file],
      mode: 'full',
      rootDir,
      thresholds: { runtimeLines: 5 },
    }).files;

    const result = runRuntimeComplexityCheck({
      baselineFiles,
      files: [file],
      mode: 'changed',
      rootDir,
      thresholds: { runtimeLines: 5 },
    });

    expect(result.violations).toEqual([]);
  });

  it('rejects growth in a legacy violation', () => {
    const file = writeFixture(
      'apps/server/api/src/demo/demo.service.ts',
      classWithPadding('DemoService', 10),
    );
    const baselineFiles = runRuntimeComplexityCheck({
      files: [file],
      mode: 'full',
      rootDir,
      thresholds: { runtimeLines: 5 },
    }).files;
    writeFixture(file, classWithPadding('DemoService', 11));

    const result = runRuntimeComplexityCheck({
      baselineFiles,
      files: [file],
      mode: 'changed',
      rootDir,
      thresholds: { runtimeLines: 5 },
    });

    expect(result.violations).toContainEqual(
      expect.objectContaining({
        actual: 11,
        file,
        metric: 'file-lines',
      }),
    );
  });

  it('preserves a legacy method ceiling across a rename', () => {
    const file = writeFixture(
      'apps/server/api/src/demo/demo.service.ts',
      [
        'export class DemoService {',
        '  legacy(): void {',
        '    const first = 1;',
        '    const second = 2;',
        '    void first;',
        '    void second;',
        '  }',
        '}',
      ].join('\n'),
    );
    const baselineFiles = runRuntimeComplexityCheck({
      files: [file],
      mode: 'full',
      rootDir,
      thresholds: { methodLines: 5 },
    }).files;
    writeFixture(
      file,
      [
        'export class DemoService {',
        '  renamed(): void {',
        '    const first = 1;',
        '    const second = 2;',
        '    void first;',
        '    void second;',
        '  }',
        '}',
      ].join('\n'),
    );

    const result = runRuntimeComplexityCheck({
      baselineFiles,
      files: [file],
      mode: 'changed',
      rootDir,
      thresholds: { methodLines: 5 },
    });

    expect(result.violations).toEqual([]);
  });

  it.each([
    'apps/server/api/src/generated/demo.service.ts',
    'apps/server/api/src/migrations/demo.service.ts',
    'apps/server/api/src/__fixtures__/demo.service.ts',
    'apps/server/api/src/test-data/demo.service.ts',
    'apps/server/api/src/demo/demo.service.spec.ts',
    'apps/server/api/src/demo/demo.service.constants.ts',
  ])('excludes %s with a narrow explicit rule', (file) => {
    writeFixture(file, classWithPadding('ExcludedService', 30));

    const result = runRuntimeComplexityCheck({
      files: [file],
      mode: 'changed',
      rootDir,
      thresholds: { runtimeLines: 1 },
    });

    expect(result.scannedFileCount).toBe(0);
    expect(result.violations).toEqual([]);
  });

  it('enforces pass and fail outcomes across synthetic changed-file commits', () => {
    initRepository();
    const service = writeFixture(
      'apps/server/api/src/demo/demo.service.ts',
      classWithPadding('DemoService', 5),
    );
    writeFixture('README.md', 'baseline');
    commitAll('baseline');

    writeFixture(service, classWithPadding('DemoService', 6));
    writeFixture('README.md', 'changed');
    commitAll('change runtime');

    const failingFiles = discoverChangedRuntimeFiles({
      baseRef: 'HEAD~1',
      rootDir,
    });
    const failingResult = runRuntimeComplexityCheck({
      files: failingFiles,
      mode: 'changed',
      rootDir,
      thresholds: { runtimeLines: 5 },
    });

    expect(failingFiles).toEqual([service]);
    expect(failingResult.violations).toContainEqual(
      expect.objectContaining({
        actual: 6,
        file: service,
        metric: 'file-lines',
      }),
    );

    writeFixture(service, classWithPadding('DemoService', 5));
    commitAll('shrink runtime');

    const passingResult = runRuntimeComplexityCheck({
      files: discoverChangedRuntimeFiles({ baseRef: 'HEAD~1', rootDir }),
      mode: 'changed',
      rootDir,
      thresholds: { runtimeLines: 5 },
    });

    expect(passingResult.violations).toEqual([]);
  });

  it('produces deterministic machine-readable census data', () => {
    const file = writeFixture(
      'packages/libs/demo/demo.service.ts',
      'export class DemoService { run(): void {} }\n',
    );

    const first = runRuntimeComplexityCheck({
      files: [file],
      mode: 'full',
      rootDir,
    });
    const second = runRuntimeComplexityCheck({
      files: [file],
      mode: 'full',
      rootDir,
    });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.files[0]).toEqual(
      expect.objectContaining({
        file,
        kind: 'runtime',
        lines: 1,
      }),
    );
  });

  function writeFixture(relativePath: string, contents: string): string {
    const absolutePath = path.join(rootDir, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents, 'utf8');
    return relativePath;
  }

  function initRepository(): void {
    runGit(['init']);
    runGit(['config', 'user.email', 'runtime-complexity@example.com']);
    runGit(['config', 'user.name', 'Runtime Complexity Test']);
  }

  function commitAll(message: string): void {
    runGit(['add', '.']);
    runGit(['commit', '-m', message]);
  }

  function runGit(args: string[]): void {
    const result = spawnSync('git', args, {
      cwd: rootDir,
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      throw new Error(result.stderr || `git ${args.join(' ')} failed`);
    }
  }
});

function classWithPadding(name: string, lines: number): string {
  const content = [`export class ${name} {`, '}'];
  while (content.length < lines) {
    content.splice(content.length - 1, 0, `  // line ${content.length}`);
  }
  return content.join('\n');
}

import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  diffSpecTypecheckBaseline,
  discoverSpecWorkspaces,
  normalizeDiagnosticMessage,
  parseSpecTypecheckBaseline,
  runSpecTypecheck,
  type SpecTypecheckFinding,
  serializeSpecTypecheckBaseline,
} from './check-spec-typecheck';

const FINGERPRINT_A = 'aaaaaaaaaaaaaaaaaaaa';
const FINGERPRINT_B = 'bbbbbbbbbbbbbbbbbbbb';

describe('check-spec-typecheck', () => {
  let testDir = '';

  beforeEach(() => {
    // realpath, because macOS hands out `/var/...` for a `/private/var/...`
    // directory and TypeScript reports the resolved form.
    testDir = realpathSync(mkdtempSync(path.join(tmpdir(), 'spec-typecheck-')));
  });

  afterEach(() => {
    rmSync(testDir, { force: true, recursive: true });
  });

  describe('discoverSpecWorkspaces', () => {
    it('discovers only workspaces that opted in with a spec tsconfig', () => {
      writeWorkspace('api');
      writeFixture('apps/server/opted-out/src/main.ts', 'export const x = 1;');

      expect(discoverSpecWorkspaces(testDir, 'apps/server')).toEqual(['api']);
    });

    it('returns nothing when the workspaces directory is absent', () => {
      expect(discoverSpecWorkspaces(testDir, 'apps/server')).toEqual([]);
    });
  });

  describe('runSpecTypecheck', () => {
    it('reports diagnostics from spec files the shipping typecheck excludes', () => {
      writeWorkspace('api');
      writeFixture(
        'apps/server/api/src/models.service.ts',
        `
          export class ModelsService {
            patchAll(ids: string[]): number {
              return ids.length;
            }
          }
        `,
      );
      writeFixture(
        'apps/server/api/src/models.service.spec.ts',
        `
          import { ModelsService } from './models.service';

          const service = new ModelsService();
          service.updateMany(['a'], {});
        `,
      );

      const result = runSpecTypecheck({
        rootDir: testDir,
        workspacesDir: 'apps/server',
      });

      expect(result.workspaces).toEqual(['api']);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.code).toBe(2339);
      expect(result.findings[0]?.file).toBe(
        'apps/server/api/src/models.service.spec.ts',
      );
      expect(result.findings[0]?.workspace).toBe('api');
    });

    it('passes on a workspace whose specs typecheck', () => {
      writeWorkspace('api');
      writeFixture(
        'apps/server/api/src/models.service.ts',
        `
          export class ModelsService {
            patchAll(ids: string[]): number {
              return ids.length;
            }
          }
        `,
      );
      writeFixture(
        'apps/server/api/src/models.service.spec.ts',
        `
          import { ModelsService } from './models.service';

          export const patched = new ModelsService().patchAll(['a']);
        `,
      );

      expect(
        runSpecTypecheck({ rootDir: testDir, workspacesDir: 'apps/server' })
          .findings,
      ).toEqual([]);
    });

    it('collapses repeats of one diagnostic into a single counted finding', () => {
      writeWorkspace('api');
      writeFixture(
        'apps/server/api/src/repeat.spec.ts',
        `
          const first: string = 1;
          const second: string = 2;

          export const values = [first, second];
        `,
      );

      const result = runSpecTypecheck({
        rootDir: testDir,
        workspacesDir: 'apps/server',
      });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.count).toBe(2);
    });

    it('keeps the checkout path out of every recorded finding', () => {
      writeWorkspace('api');
      writeFixture(
        'apps/server/api/src/left.ts',
        'export type Shape = { left: string };',
      );
      writeFixture(
        'apps/server/api/src/right.ts',
        'export type Shape = { right: string };',
      );
      writeFixture(
        'apps/server/api/src/collide.spec.ts',
        `
          import type { Shape as Left } from './left';
          import type { Shape as Right } from './right';

          export const widen = (value: Left): Right => value;
        `,
      );

      const result = runSpecTypecheck({
        rootDir: testDir,
        workspacesDir: 'apps/server',
      });

      expect(result.findings.length).toBeGreaterThan(0);
      for (const finding of result.findings) {
        expect(finding.message).not.toContain(testDir);
        expect(finding.file).not.toContain(testDir);
      }
    });
  });

  describe('normalizeDiagnosticMessage', () => {
    it('replaces the absolute root so fingerprints survive a different checkout', () => {
      expect(
        normalizeDiagnosticMessage(
          '/home/runner/work/genfeed.ai/genfeed.ai',
          `Argument of type 'import("/home/runner/work/genfeed.ai/genfeed.ai/apps/server/api/src/shape").Shape' is not assignable.`,
        ),
      ).toBe(
        `Argument of type 'import("<root>/apps/server/api/src/shape").Shape' is not assignable.`,
      );
    });

    it('drops the bun store content hash', () => {
      expect(
        normalizeDiagnosticMessage(
          '/repo',
          'typeof import("/repo/node_modules/.bun/sharp@0.35.3+7cb241fc07b679d9/node_modules/sharp/dist/index")',
        ),
      ).toBe(
        'typeof import("<root>/node_modules/.bun/sharp@0.35.3/node_modules/sharp/dist/index")',
      );
    });

    it('leaves a message with no absolute path untouched', () => {
      const message =
        "Property 'updateMany' does not exist on type 'ModelsService'.";

      expect(normalizeDiagnosticMessage('/repo', message)).toBe(message);
    });
  });

  describe('parseSpecTypecheckBaseline', () => {
    it('round-trips serialized findings', () => {
      const findings = [finding({ fingerprint: FINGERPRINT_A })];

      expect(
        parseSpecTypecheckBaseline(serializeSpecTypecheckBaseline(findings)),
      ).toEqual({ entries: findings, version: 1 });
    });

    it('rejects an unknown baseline version', () => {
      expect(() =>
        parseSpecTypecheckBaseline(
          JSON.stringify({ entries: [], version: 99 }),
        ),
      ).toThrow(/Invalid spec-typecheck baseline/u);
    });

    it('rejects entries carrying unknown keys', () => {
      expect(() =>
        parseSpecTypecheckBaseline(
          JSON.stringify({
            entries: [{ ...finding({}), reason: 'wontfix' }],
            version: 1,
          }),
        ),
      ).toThrow(/Invalid spec-typecheck baseline/u);
    });

    it('rejects duplicate fingerprints', () => {
      expect(() =>
        parseSpecTypecheckBaseline(
          JSON.stringify({
            entries: [finding({}), finding({ file: 'other.spec.ts' })],
            version: 1,
          }),
        ),
      ).toThrow(/duplicate fingerprint/u);
    });
  });

  describe('diffSpecTypecheckBaseline', () => {
    it('passes when the findings match the baseline exactly', () => {
      const findings = [finding({})];

      expect(diffSpecTypecheckBaseline(findings, findings)).toEqual({
        regressions: [],
        stale: [],
      });
    });

    it('flags a diagnostic that is absent from the baseline', () => {
      const diff = diffSpecTypecheckBaseline(
        [finding({}), finding({ fingerprint: FINGERPRINT_B })],
        [finding({})],
      );

      expect(diff.regressions).toHaveLength(1);
      expect(diff.regressions[0]?.fingerprint).toBe(FINGERPRINT_B);
      expect(diff.stale).toEqual([]);
    });

    it('flags a baselined diagnostic whose occurrence count grew', () => {
      const diff = diffSpecTypecheckBaseline(
        [finding({ count: 3 })],
        [finding({ count: 2 })],
      );

      expect(diff.regressions).toHaveLength(1);
      expect(diff.stale).toEqual([]);
    });

    it('flags a resolved baseline entry as stale so debt only shrinks', () => {
      const diff = diffSpecTypecheckBaseline([], [finding({})]);

      expect(diff.regressions).toEqual([]);
      expect(diff.stale).toHaveLength(1);
      expect(diff.stale[0]?.fingerprint).toBe(FINGERPRINT_A);
    });

    it('flags a partially resolved entry as stale', () => {
      const diff = diffSpecTypecheckBaseline(
        [finding({ count: 1 })],
        [finding({ count: 2 })],
      );

      expect(diff.regressions).toEqual([]);
      expect(diff.stale).toHaveLength(1);
    });
  });

  function finding(
    overrides: Partial<SpecTypecheckFinding>,
  ): SpecTypecheckFinding {
    return {
      code: 2339,
      count: 1,
      file: 'apps/server/api/src/models.service.spec.ts',
      fingerprint: FINGERPRINT_A,
      message: "Property 'updateMany' does not exist on type 'ModelsService'.",
      workspace: 'api',
      ...overrides,
    };
  }

  /**
   * A self-contained spec tsconfig: the real ones extend
   * `apps/server/tsconfig.typecheck.base.json`, whose path aliases resolve into
   * built package `dist` output that a temp directory has no way to provide.
   */
  function writeWorkspace(name: string): void {
    writeFixture(
      `apps/server/${name}/tsconfig.typecheck.specs.json`,
      JSON.stringify({
        compilerOptions: {
          module: 'esnext',
          moduleResolution: 'bundler',
          noEmit: true,
          skipLibCheck: true,
          strict: true,
          target: 'es2022',
          types: [],
        },
        exclude: ['node_modules', 'dist'],
        include: ['src/**/*'],
      }),
    );
  }

  function writeFixture(relativePath: string, contents: string): void {
    const absolutePath = path.join(testDir, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents);
  }
});

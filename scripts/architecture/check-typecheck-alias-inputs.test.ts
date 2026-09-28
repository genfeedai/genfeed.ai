import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkTypecheckAliasInputs,
  typecheckTsconfigs,
} from './check-typecheck-alias-inputs';

const testDirs: string[] = [];

afterEach(() => {
  for (const testDir of testDirs.splice(0)) {
    rmSync(testDir, { force: true, recursive: true });
  }
});

const ROOT_TURBO = `{
  // Mirrors the repository root definition.
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "*.tsbuildinfo"]
    },
    "type-check": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$"]
    }
  }
}`;

function fixture(files: Record<string, unknown>): string {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'typecheck-alias-inputs-'));
  testDirs.push(rootDir);

  const allFiles: Record<string, unknown> = {
    'package.json': { name: 'root', workspaces: ['apps/*', 'packages/*'] },
    'turbo.json': ROOT_TURBO,
    ...files,
  };
  for (const [file, content] of Object.entries(allFiles)) {
    const absolutePath = path.join(rootDir, file);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(
      absolutePath,
      typeof content === 'string' ? content : JSON.stringify(content),
    );
  }

  return rootDir;
}

function workspace(
  name: string,
  options: {
    dependencies?: Record<string, string>;
    typeCheck?: string;
  } = {},
): Record<string, unknown> {
  return {
    dependencies: options.dependencies,
    name,
    scripts: options.typeCheck ? { 'type-check': options.typeCheck } : {},
  };
}

function consumerTsconfig(paths: Record<string, string[]>) {
  return { compilerOptions: { paths } };
}

const TARGET = {
  'packages/target/package.json': workspace('@x/target', {
    typeCheck: 'tsc --noEmit',
  }),
  'packages/target/src/index.ts': 'export const target = 1;\n',
};

describe('typecheck alias inputs guard', () => {
  it('flags an alias into an undeclared sibling source that type-check never hashes', () => {
    const rootDir = fixture({
      ...TARGET,
      'packages/consumer/package.json': workspace('@x/consumer', {
        typeCheck: 'tsc --noEmit',
      }),
      'packages/consumer/tsconfig.json': consumerTsconfig({
        '@x/target/*': ['../target/src/*'],
      }),
    });

    expect(checkTypecheckAliasInputs(rootDir)).toEqual([
      {
        alias: '@x/target/*',
        isBuildOutput: false,
        target: 'packages/target/src/*',
        targetWorkspace: 'packages/target',
        tsconfig: 'packages/consumer/tsconfig.json',
        workspace: '@x/consumer',
        workspaceDir: 'packages/consumer',
      },
    ]);
  });

  it('accepts the target once the consumer hashes it as a $TURBO_ROOT$ type-check input', () => {
    const rootDir = fixture({
      ...TARGET,
      'packages/consumer/package.json': workspace('@x/consumer', {
        typeCheck: 'tsc --noEmit',
      }),
      'packages/consumer/tsconfig.json': consumerTsconfig({
        '@x/target/*': ['../target/src/*'],
      }),
      'packages/consumer/turbo.json': `{
        "extends": ["//"],
        "tasks": {
          // tsconfig paths reach target's sources.
          "type-check": {
            "inputs": [
              "$TURBO_EXTENDS$",
              "$TURBO_ROOT$/packages/target/**",
              "!$TURBO_ROOT$/packages/*/dist/**"
            ]
          }
        }
      }`,
    });

    expect(checkTypecheckAliasInputs(rootDir)).toEqual([]);
  });

  it('accepts targets reached through transitive declared dependencies', () => {
    const rootDir = fixture({
      ...TARGET,
      'packages/middle/package.json': workspace('@x/middle', {
        dependencies: { '@x/target': 'workspace:*' },
      }),
      'packages/consumer/package.json': workspace('@x/consumer', {
        dependencies: { '@x/middle': 'workspace:*' },
        typeCheck: 'tsc --noEmit',
      }),
      'packages/consumer/tsconfig.json': consumerTsconfig({
        '@x/target': ['../target/src/index.ts'],
      }),
    });

    expect(checkTypecheckAliasInputs(rootDir)).toEqual([]);
  });

  it('requires the build in the task graph for an alias into build output', () => {
    const files = {
      ...TARGET,
      'packages/consumer/tsconfig.json': consumerTsconfig({
        '@x/target': ['../target/dist/index.d.ts'],
      }),
      // Hashing target's sources neither builds nor orders its dist.
      'packages/consumer/turbo.json': {
        extends: ['//'],
        tasks: {
          'type-check': {
            inputs: ['$TURBO_EXTENDS$', '$TURBO_ROOT$/packages/target/**'],
          },
        },
      },
    };

    const undeclared = fixture({
      ...files,
      'packages/consumer/package.json': workspace('@x/consumer', {
        typeCheck: 'tsc --noEmit',
      }),
    });
    expect(checkTypecheckAliasInputs(undeclared)).toMatchObject([
      { isBuildOutput: true, target: 'packages/target/dist/index.d.ts' },
    ]);

    const declared = fixture({
      ...files,
      'packages/consumer/package.json': workspace('@x/consumer', {
        dependencies: { '@x/target': 'workspace:*' },
        typeCheck: 'tsc --noEmit',
      }),
    });
    expect(checkTypecheckAliasInputs(declared)).toEqual([]);
  });

  it('follows same-package dependsOn tasks whose inputs hash the sibling', () => {
    const rootDir = fixture({
      'apps/sibling/package.json': workspace('@x/sibling'),
      'apps/sibling/src/index.ts': 'export {};\n',
      'apps/consumer/package.json': workspace('@x/consumer', {
        typeCheck: 'tsc --noEmit -p tsconfig.typecheck.json',
      }),
      'apps/consumer/tsconfig.typecheck.json': consumerTsconfig({
        '@sibling/*': ['../sibling/src/*'],
      }),
      'apps/consumer/turbo.json': {
        extends: ['//'],
        tasks: {
          build: { inputs: ['$TURBO_DEFAULT$', '$TURBO_ROOT$/apps/*/src/**'] },
          'type-check': { dependsOn: ['build', '^build'] },
        },
      },
    });

    expect(checkTypecheckAliasInputs(rootDir)).toEqual([]);
  });

  it('resolves paths inherited through extends relative to the defining config', () => {
    const rootDir = fixture({
      ...TARGET,
      'apps/tsconfig.shared.json': consumerTsconfig({
        '@x/target/*': ['../packages/target/src/*'],
      }),
      'apps/consumer/package.json': workspace('@x/consumer', {
        typeCheck: 'tsc --noEmit',
      }),
      'apps/consumer/tsconfig.json': { extends: '../tsconfig.shared.json' },
    });

    expect(checkTypecheckAliasInputs(rootDir)).toMatchObject([
      {
        target: 'packages/target/src/*',
        tsconfig: 'apps/consumer/tsconfig.json',
      },
    ]);
  });

  it('ignores self aliases, non-workspace targets and workspaces without type-check', () => {
    const rootDir = fixture({
      ...TARGET,
      'packages/consumer/package.json': workspace('@x/consumer', {
        typeCheck: 'tsc --noEmit',
      }),
      'packages/consumer/tsconfig.json': consumerTsconfig({
        '@consumer/*': ['./*'],
        '@root/*': ['../../scripts/*'],
      }),
      'packages/untyped/package.json': workspace('@x/untyped'),
      'packages/untyped/tsconfig.json': consumerTsconfig({
        '@x/target/*': ['../target/src/*'],
      }),
    });

    expect(checkTypecheckAliasInputs(rootDir)).toEqual([]);
  });

  it('reads the tsconfig each type-check script hands to tsc', () => {
    expect(typecheckTsconfigs('bun run check.ts && tsc --noEmit')).toEqual([
      'tsconfig.json',
    ]);
    expect(
      typecheckTsconfigs('tsc --noEmit -p tsconfig.typecheck.json'),
    ).toEqual(['tsconfig.typecheck.json']);
    expect(typecheckTsconfigs('tsc --project tsconfig.build.json')).toEqual([
      'tsconfig.build.json',
    ]);
    expect(typecheckTsconfigs('bunx turbo run type-check')).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  classifySpecTypecheckScope,
  planPreflight,
  type SpecWorkspaceInventory,
  selectBiomeFiles,
  selectSecretlintFiles,
  touchesMigrationFiles,
} from './preflight-plan';

const inventory: SpecWorkspaceInventory = {
  all: ['api', 'workers', 'web', 'contracts', 'ui'],
  appWorkspaces: new Set(['web']),
  serverWorkspaces: new Set(['api', 'workers']),
};

describe('classifySpecTypecheckScope', () => {
  it.each([
    {
      changed: ['apps/server/api/src/foo/foo.service.spec.ts'],
      expected: { apps: ['api'], needsTurbo: false, workspaces: ['api'] },
      name: 'a server workspace with its own spec config',
    },
    {
      changed: ['apps/web/app/page.tsx', 'apps/web/src/a.test.tsx'],
      expected: { apps: ['web'], needsTurbo: false, workspaces: ['web'] },
      name: 'the web app',
    },
    {
      changed: ['apps/docs/content/intro.mdx', 'apps/marketing/app/page.tsx'],
      expected: { apps: [], needsTurbo: false, workspaces: [] },
      name: 'apps that are not enrolled in the ratchet',
    },
    {
      changed: ['docs/guide.md', '.agents/memory/MEMORY.md', 'README.md'],
      expected: { apps: [], needsTurbo: false, workspaces: [] },
      name: 'documentation only',
    },
    {
      changed: ['packages/contracts/src/index.ts'],
      expected: { apps: [], needsTurbo: true, workspaces: [] },
      name: 'a package, whose fan-out turbo resolves',
    },
    {
      changed: ['packages/ui/src/a.tsx', 'apps/server/api/src/a.ts'],
      expected: { apps: ['api'], needsTurbo: true, workspaces: [] },
      name: 'a package plus a server workspace',
    },
  ])('scopes $name', ({ changed, expected }) => {
    const scope = classifySpecTypecheckScope(changed, inventory);

    expect({
      apps: scope.apps,
      needsTurbo: scope.needsTurbo,
      workspaces: scope.workspaces,
    }).toEqual(expected);
  });

  it.each([
    {
      changed: ['apps/server/tsconfig.base.json'],
      reason: 'full: shared server config apps/server/tsconfig.base.json',
    },
    {
      changed: ['apps/server/newservice/src/a.ts'],
      reason: 'full: shared server surface apps/server/newservice/src/a.ts',
    },
    {
      changed: ['package.json'],
      reason: 'full: shared surface package.json',
    },
    {
      changed: ['scripts/ci/preflight.ts', 'docs/a.md'],
      reason: 'full: shared surface scripts/ci/preflight.ts',
    },
    {
      changed: ['.github/workflows/ci.yml'],
      reason: 'full: shared surface .github/workflows/ci.yml',
    },
  ])('escalates to every workspace for $changed', ({ changed, reason }) => {
    const scope = classifySpecTypecheckScope(changed, inventory);

    expect({ reason: scope.reason, workspaces: scope.workspaces }).toEqual({
      reason,
      workspaces: ['api', 'workers', 'web', 'contracts', 'ui'],
    });
  });
});

describe('file selection', () => {
  it('sends only code files to Biome', () => {
    expect(
      selectBiomeFiles([
        'apps/web/a.tsx',
        'packages/x/b.json',
        'README.md',
        'scripts/c.sh',
        'apps/web/d.css',
      ]),
    ).toEqual(['apps/web/a.tsx', 'packages/x/b.json', 'apps/web/d.css']);
  });

  it('sends code, config and shell files to secretlint', () => {
    expect(
      selectSecretlintFiles([
        'a.ts',
        'b.yml',
        'c.sh',
        '.env.example',
        'd.png',
        'e.md',
      ]),
    ).toEqual(['a.ts', 'b.yml', 'c.sh', '.env.example']);
  });

  it.each([
    {
      changed: ['packages/prisma/prisma/schema.prisma'],
      expected: true,
    },
    {
      changed: ['packages/prisma/prisma/migrations/2026_01_a/migration.sql'],
      expected: true,
    },
    { changed: ['packages/prisma/src/index.ts'], expected: false },
  ])('detects migration changes in $changed', ({ changed, expected }) => {
    expect(touchesMigrationFiles(changed)).toBe(expected);
  });
});

describe('planPreflight', () => {
  const base = {
    base: 'abc123',
    changedFiles: ['apps/server/api/src/a.service.spec.ts'],
    hasGitleaks: false,
    specBuildFilters: [] as string[],
    specWorkspaces: ['api'],
    touchesMigrations: false,
    typecheckFilters: ['--filter=@genfeedai/api'],
  };

  it('plans the static, typecheck, spec and contract stages for a spec change', () => {
    expect(planPreflight(base).map((step) => step.id)).toEqual([
      'ratchet-growth',
      'e2e-spec-impact',
      'skills-catalog',
      'skill-allowlist',
      'env-check',
      'biome',
      'secretlint',
      'typecheck',
      'spec-build',
      'spec-typecheck:api',
      'contracts-build',
      'executable-contracts',
    ]);
  });

  it('skips the typecheck and spec stages when no workspace is affected', () => {
    const ids = planPreflight({
      ...base,
      changedFiles: ['docs/guide.md'],
      specWorkspaces: [],
      typecheckFilters: [],
    }).map((step) => step.id);

    expect(ids).toEqual([
      'ratchet-growth',
      'e2e-spec-impact',
      'skills-catalog',
      'skill-allowlist',
      'env-check',
      'contracts-build',
      'executable-contracts',
    ]);
  });

  it('adds gitleaks, migration safety and lint only when they apply', () => {
    const ids = planPreflight({
      ...base,
      hasGitleaks: true,
      hasLint: true,
      touchesMigrations: true,
    }).map((step) => step.id);

    expect(ids).toEqual(
      expect.arrayContaining(['gitleaks', 'migration-safety', 'lint']),
    );
  });

  it('builds only the affected packages when turbo narrowed the scope', () => {
    const build = planPreflight({
      ...base,
      specBuildFilters: ['--filter=@genfeedai/contracts'],
    }).find((step) => step.id === 'spec-build');

    expect(build?.command).toEqual([
      'bunx',
      'turbo',
      'run',
      'build',
      '--filter=@genfeedai/contracts',
      '--concurrency=2',
    ]);
  });

  it('builds every package when the scope is not narrowed', () => {
    const build = planPreflight(base).find((step) => step.id === 'spec-build');

    expect(build?.command).toContain('--filter=./packages/*');
  });

  it('passes the diff base to the base-aware checks', () => {
    const steps = planPreflight(base);

    expect(
      steps.find((step) => step.id === 'ratchet-growth')?.command.slice(-2),
    ).toEqual(['--base', 'abc123']);
    expect(
      steps.find((step) => step.id === 'e2e-spec-impact')?.command.slice(-2),
    ).toEqual(['--base', 'abc123']);
  });
});

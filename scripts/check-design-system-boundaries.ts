import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import { globSync } from 'glob';

const logger = new Logger('CheckDesignSystemBoundaries');

const BANNED_COMPONENT_GLOBS = [
  'apps/web/*/packages/components/**/_menu.tsx',
  'apps/web/*/packages/components/**/_topbar.tsx',
];

const GUARDED_IMPORT_GLOBS = [
  'apps/web/**/*.{ts,tsx,js,jsx}',
  'packages/**/*.{ts,tsx,js,jsx}',
];

const EXCLUDE_GLOBS = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.stories.*',
  '**/*.md',
  '**/*.mdx',
  '**/dist/**',
  '**/node_modules/**',
];

const BANNED_IMPORT_PATTERNS = [/@components\/_menu/g, /@components\/_topbar/g];

const REQUIRED_DESIGN_TOKEN_IMPORTS = [
  'apps/mobile/app/constants/theme.ts',
  'apps/extensions/browser/app/tailwind.config.ts',
  'apps/extensions/ide/app/src/styles/webview-theme.ts',
];

type Violation =
  | {
      kind: 'banned-file';
      file: string;
    }
  | {
      kind: 'banned-import';
      file: string;
      line: number;
    }
  | {
      kind: 'missing-design-token-import';
      file: string;
    };

function findBannedFiles(rootDir: string): Violation[] {
  return BANNED_COMPONENT_GLOBS.flatMap((pattern) =>
    globSync(pattern, {
      absolute: true,
      ignore: EXCLUDE_GLOBS,
      nodir: true,
    }).map((filePath) => ({
      file: path.relative(rootDir, filePath),
      kind: 'banned-file' as const,
    })),
  );
}

function findBannedImports(rootDir: string): Violation[] {
  const files = globSync(GUARDED_IMPORT_GLOBS, {
    absolute: true,
    ignore: EXCLUDE_GLOBS,
    nodir: true,
  });

  const violations: Violation[] = [];

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8');
    const relativePath = path.relative(rootDir, filePath);

    for (const pattern of BANNED_IMPORT_PATTERNS) {
      for (const match of content.matchAll(pattern)) {
        const index = match.index ?? 0;
        violations.push({
          file: relativePath,
          kind: 'banned-import',
          line: content.slice(0, index).split('\n').length,
        });
      }
    }
  }

  return violations;
}

function findMissingDesignTokenImports(rootDir: string): Violation[] {
  const violations: Violation[] = [];

  for (const relativePath of REQUIRED_DESIGN_TOKEN_IMPORTS) {
    const absolutePath = path.join(rootDir, relativePath);
    if (!existsSync(absolutePath)) {
      continue;
    }

    const content = readFileSync(absolutePath, 'utf8');
    if (!content.includes('@genfeedai/ui')) {
      violations.push({
        file: relativePath,
        kind: 'missing-design-token-import',
      });
    }
  }

  return violations;
}

export function runCheckDesignSystemBoundaries(): { violations: Violation[] } {
  const rootDir = process.cwd();

  return {
    violations: [
      ...findBannedFiles(rootDir),
      ...findBannedImports(rootDir),
      ...findMissingDesignTokenImports(rootDir),
    ],
  };
}

function isMainModule(): boolean {
  const entryPoint = process.argv[1];
  return Boolean(entryPoint) && path.resolve(entryPoint) === __filename;
}

if (isMainModule()) {
  const { violations } = runCheckDesignSystemBoundaries();

  if (violations.length > 0) {
    logger.error(
      'Design-system boundary violations found. Shared shell entrypoints must live in packages/ui and platform adapters must consume @genfeedai/ui.',
    );

    for (const violation of violations) {
      if (violation.kind === 'banned-import') {
        logger.error(
          `- [${violation.kind}] ${violation.file}:${violation.line}`,
        );
        continue;
      }

      logger.error(`- [${violation.kind}] ${violation.file}`);
    }

    process.exit(1);
  }

  logger.log('Design-system boundaries are intact.');
}

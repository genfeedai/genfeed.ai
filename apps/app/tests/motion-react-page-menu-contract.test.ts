import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(process.cwd(), '../..');

const SCAN_ROOTS = [
  join(process.cwd(), 'app'),
  join(process.cwd(), 'packages'),
  join(process.cwd(), 'src'),
  join(REPO_ROOT, 'packages/pages'),
  join(REPO_ROOT, 'packages/ui/src'),
  join(REPO_ROOT, 'apps/website/app'),
  join(REPO_ROOT, 'apps/website/packages'),
];

const SKIP_DIRECTORIES = new Set(['.next', 'coverage', 'dist', 'node_modules']);

// Static (`from 'motion/react'`, `import 'motion/react'`) and dynamic
// (`import('motion/react')`) loads, and `require`.
const MOTION_IMPORT =
  /(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"](?:motion(?:\/[^'"]+)?|framer-motion)['"]/u;

const HOOK_MODULE = 'use-hover-animated-icon';

const PAGE_MENU_HOOK_FILES = [
  'packages/ui/src/components/menus/item/MenuItem.tsx',
  'packages/ui/src/components/menus/sidebar-action-trigger/SidebarActionTrigger.tsx',
  'packages/ui/src/components/shell/app-rail/AppRail.tsx',
  'packages/ui/src/primitives/animated-icons/use-hover-animated-icon.test.tsx',
];

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (SKIP_DIRECTORIES.has(entry)) {
      return [];
    }

    const absolutePath = join(directory, entry);
    if (statSync(absolutePath).isDirectory()) {
      return collectSourceFiles(absolutePath);
    }

    return /\.tsx?$/u.test(entry) ? [absolutePath] : [];
  });
}

function repoPath(absolutePath: string): string {
  return relative(REPO_ROOT, absolutePath);
}

function isAnimatedIconLibrary(path: string): boolean {
  return path.startsWith('packages/ui/src/primitives/animated-icons/');
}

const SOURCE_FILES = SCAN_ROOTS.flatMap((root) => collectSourceFiles(root));

describe('motion/react page-menu contract', () => {
  it('imports motion/react only from the page-menu icon library', () => {
    const leaks = SOURCE_FILES.filter((file) => {
      const path = repoPath(file);
      return (
        !isAnimatedIconLibrary(path) &&
        MOTION_IMPORT.test(readFileSync(file, 'utf8'))
      );
    }).map(repoPath);

    expect(leaks).toEqual([]);
  });

  it('drives hover animation only from page-menu components', () => {
    const hosts = SOURCE_FILES.filter((file) =>
      readFileSync(file, 'utf8').includes(HOOK_MODULE),
    )
      .map(repoPath)
      .sort();

    expect(hosts).toEqual(PAGE_MENU_HOOK_FILES);
  });
});

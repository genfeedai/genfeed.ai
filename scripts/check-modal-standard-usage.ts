import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const ROOT = process.cwd();

const INCLUDE_GLOBS = [
  'apps/*/app/**/*.{ts,tsx}',
  'apps/*/src/**/*.{ts,tsx}',
  'apps/*/packages/**/*.{ts,tsx}',
  'packages/*/**/*.{ts,tsx}',
];
const EXCLUDE_GLOBS = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.mdx',
  '**/*.md',
  '**/node_modules/**',
  '**/*.d.ts',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
];

const ALLOWED_DIALOG_IMPORT_PATH_SEGMENTS = [
  '/packages/ui/src/primitives/dialog.tsx',
  '/packages/ui/src/primitives/command.tsx',
];

const SHOW_MODAL_PATTERN = /\bshowModal\s*\(/g;
const DIALOG_IMPORT_PATTERN = /from\s+['"]@radix-ui\/react-dialog['"]/g;

export type Violation = {
  file: string;
  line: number;
  reason: string;
};

const QUOTED_STRING_PATTERN = /(['"`])((?:(?!\1)[^\n\\])*)\1/g;
const OVERLAY_ALLOW_PATTERN = /ui-guard-allow:overlay\s+--\s+\S/;

/**
 * The shared UI package owns scrims, drawers and loading veils; everywhere
 * else must compose `Dialog`, `Popover`, `DropdownMenu` or `LoadingOverlay`
 * so Escape, focus trapping and focus restore come with the surface.
 */
function isUiPackageFile(filePath: string): boolean {
  return filePath.replaceAll('\\', '/').includes('/packages/ui/src/');
}

function classifyOverlayClasses(classes: string): string | null {
  const tokens = new Set(classes.split(/\s+/).filter(Boolean));
  if (tokens.has('pointer-events-none')) {
    return null;
  }

  const hasFixedBackdrop =
    tokens.has('fixed') && (tokens.has('inset-0') || tokens.has('inset-y-0'));
  if (hasFixedBackdrop) {
    return 'Hand-built `fixed inset-0` overlay. Use the shared `Dialog` (placement: center, left, right, top) so Escape, focus trap and focus restore come with it.';
  }

  const isScrimVeil =
    tokens.has('absolute') &&
    tokens.has('inset-0') &&
    [...tokens].some((token) => token.startsWith('backdrop-blur')) &&
    [...tokens].some((token) => token.startsWith('bg-'));
  if (isScrimVeil) {
    return 'Hand-built loading veil. Use `LoadingOverlay` from `@ui/primitives/loading-overlay`.';
  }

  return null;
}

export function findOverlayViolations(
  filePath: string,
  content: string,
): Violation[] {
  if (isUiPackageFile(filePath)) {
    return [];
  }

  const lines = content.split('\n');
  const violations: Violation[] = [];

  lines.forEach((text, index) => {
    const isAllowed =
      OVERLAY_ALLOW_PATTERN.test(text) ||
      OVERLAY_ALLOW_PATTERN.test(lines[index - 1] ?? '');
    if (isAllowed) {
      return;
    }

    for (const match of text.matchAll(QUOTED_STRING_PATTERN)) {
      const reason = classifyOverlayClasses(match[2] ?? '');
      if (reason) {
        violations.push({
          file: path.relative(ROOT, filePath),
          line: index + 1,
          reason,
        });
        break;
      }
    }
  });

  return violations;
}

function isAllowedDialogImportFile(filePath: string): boolean {
  const normalized = filePath.replaceAll('\\', '/');
  return ALLOWED_DIALOG_IMPORT_PATH_SEGMENTS.some((segment) =>
    normalized.includes(segment),
  );
}

function shouldAllowShowModal(filePath: string): boolean {
  const normalized = filePath.replaceAll('\\', '/');
  return normalized.includes('/packages/hooks/ui/use-command-palette-dialog/');
}

export function findViolations(
  filePath: string,
  content = readFileSync(filePath, 'utf-8'),
): Violation[] {
  const violations: Violation[] = [];

  if (!shouldAllowShowModal(filePath)) {
    for (const match of content.matchAll(SHOW_MODAL_PATTERN)) {
      const line = content.slice(0, match.index ?? 0).split('\n').length;
      violations.push({
        file: path.relative(ROOT, filePath),
        line,
        reason:
          'Avoid DOM-driven modal control (`showModal`). Use store-backed modal helper APIs.',
      });
    }
  }

  if (!isAllowedDialogImportFile(filePath)) {
    for (const match of content.matchAll(DIALOG_IMPORT_PATTERN)) {
      const line = content.slice(0, match.index ?? 0).split('\n').length;
      violations.push({
        file: path.relative(ROOT, filePath),
        line,
        reason:
          'Direct Radix dialog imports are restricted. Use the shared `@ui/primitives/dialog` (Dialog, DialogContent, DialogBody, DialogFooter).',
      });
    }
  }

  violations.push(...findOverlayViolations(filePath, content));

  return violations;
}

function main(): void {
  const files = globSync(INCLUDE_GLOBS, {
    absolute: true,
    ignore: EXCLUDE_GLOBS,
    nodir: true,
  });

  const allViolations: Violation[] = [];
  for (const filePath of files) {
    allViolations.push(...findViolations(filePath));
  }

  if (allViolations.length > 0) {
    console.error('Modal architecture violations found.');
    for (const violation of allViolations) {
      console.error(
        `- ${violation.file}:${violation.line} — ${violation.reason}`,
      );
    }
    process.exit(1);
  }

  console.log('No modal architecture violations found.');
}

if (import.meta.main) {
  main();
}

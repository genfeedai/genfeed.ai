import { readFileSync } from 'node:fs';
import path from 'node:path';
import { globSync } from 'glob';

const ROOT = process.cwd();

const INCLUDE_GLOBS = [
  'packages/ui/modals/**/*.{ts,tsx,js,jsx}',
  'packages/hooks/ui/use-modal*/**/*.{ts,tsx,js,jsx}',
  'packages/helpers/src/ui/modal/**/*.{ts,tsx,js,jsx}',
];
const EXCLUDE_GLOBS = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.stories.*',
  '**/*.mdx',
  '**/*.md',
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
];

const ALLOWED_DIALOG_IMPORT_PATH_SEGMENTS = [
  '/packages/ui/primitives/dialog.tsx',
  '/packages/ui/primitives/sheet.tsx',
  '/packages/ui/modals/compound/Modal.tsx',
];

const SHOW_MODAL_PATTERN = /\bshowModal\s*\(/g;
const DIALOG_IMPORT_PATTERN =
  /from\s+['"]@radix-ui\/react-dialog['"]|from\s+['"]@ui\/primitives\/dialog['"]/g;

type Violation = {
  file: string;
  line: number;
  reason: string;
};

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

function findViolations(filePath: string): Violation[] {
  const content = readFileSync(filePath, 'utf-8');
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
          'Direct dialog imports are restricted. Use `@ui/modals/compound/Modal` or approved primitives.',
      });
    }
  }

  return violations;
}

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

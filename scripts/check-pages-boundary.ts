import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const SHARED_PAGES_DIR = path.join(ROOT_DIR, 'packages/pages');

const IGNORE_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  'coverage',
]);

const SOURCE_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

const FORBIDDEN_APP_LOCAL_PREFIXES: string[] = [];

type Violation = {
  file: string;
  line: number;
  specifier: string;
};

const MODULE_SPECIFIER_PATTERN =
  /(?:import|export)\s+(?:type\s+)?(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function isForbiddenSpecifier(specifier: string): boolean {
  return FORBIDDEN_APP_LOCAL_PREFIXES.some((prefix) =>
    specifier.startsWith(prefix),
  );
}

function collectSourceFiles(dirPath: string): string[] {
  const entries = readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (IGNORE_DIR_NAMES.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(entryPath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (SOURCE_FILE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

function collectViolations(filePath: string): Violation[] {
  const sourceText = readFileSync(filePath, 'utf8');
  const violations: Violation[] = [];
  const matches = sourceText.matchAll(MODULE_SPECIFIER_PATTERN);

  for (const match of matches) {
    const specifier = match[1] ?? match[2];

    if (!specifier || !isForbiddenSpecifier(specifier)) {
      continue;
    }

    const matchIndex = match.index ?? 0;
    const line = sourceText.slice(0, matchIndex).split('\n').length;

    violations.push({
      file: path.relative(ROOT_DIR, filePath),
      line,
      specifier,
    });
  }

  return violations;
}

function main() {
  if (!statSync(SHARED_PAGES_DIR).isDirectory()) {
    console.log('packages/pages does not exist. Skipping boundary check.');
    return;
  }

  const files = collectSourceFiles(SHARED_PAGES_DIR);
  const violations = files.flatMap((filePath) => collectViolations(filePath));

  if (violations.length === 0) {
    console.log('packages/pages boundary is clean.');
    return;
  }

  console.error(
    'packages/pages contains imports to app-local page modules. Move those dependencies into the owning app or back into a shared package.',
  );

  for (const violation of violations) {
    console.error(
      `- ${violation.file}:${violation.line} (${violation.specifier})`,
    );
  }

  process.exit(1);
}

main();

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(process.cwd(), 'src');
const ALLOWED_FILES = new Set<string>([
  'common/middleware/request-context.middleware.ts',
  'helpers/utils/clerk/clerk.util.ts',
  'helpers/utils/collection-filter/collection-filter.util.ts',
]);

const BANNED = [
  'publicMetadata.isSuperAdmin',
  'publicMetadata.subscriptionTier',
  'publicMetadata.stripeSubscriptionStatus',
];

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const st = statSync(fullPath);

    if (st.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    if (!fullPath.endsWith('.ts') && !fullPath.endsWith('.tsx')) {
      continue;
    }

    if (fullPath.endsWith('.spec.ts') || fullPath.endsWith('.test.ts')) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

const violations: string[] = [];

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);

  if (ALLOWED_FILES.has(rel)) {
    continue;
  }

  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    for (const pattern of BANNED) {
      if (line.includes(pattern)) {
        violations.push(`${rel}:${index + 1} -> ${pattern}`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error(
    'RequestContext enforcement failed. Use req.context via helpers instead of direct publicMetadata access.',
  );
  for (const violation of violations) {
    console.error(`  - ${violation}`);
  }
  process.exit(1);
}

console.log('RequestContext enforcement check passed.');

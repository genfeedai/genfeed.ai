import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = process.cwd();

interface Violation {
  file: string;
  message: string;
}

const violations: Violation[] = [];

function forbidPath(relativePath: string, message: string): void {
  if (existsSync(join(repoRoot, relativePath))) {
    violations.push({ file: relativePath, message });
  }
}

function forbidSourceMatch(
  relativePath: string,
  pattern: RegExp,
  message: string,
): void {
  const absolutePath = join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    return;
  }
  const source = readFileSync(absolutePath, 'utf8');
  if (pattern.test(source)) {
    violations.push({
      file: relative(repoRoot, absolutePath),
      message,
    });
  }
}

forbidPath(
  'apps/server/api/src/collections/content-schedules',
  'ContentSchedule REST collection was deleted in #2665 and must not be reintroduced.',
);
forbidPath(
  'packages/serializers/src/server/content/content-schedule.serializer.ts',
  'ContentScheduleSerializer was deleted in #2665 and must not be reintroduced.',
);
forbidSourceMatch(
  'packages/prisma/prisma/schema.prisma',
  /\bmodel ContentSchedule\b/,
  'Prisma ContentSchedule model was dropped in #2665 and must not be reintroduced.',
);
forbidSourceMatch(
  'packages/services/social/source-posts.service.ts',
  /\bpublishTwitterAction\b/,
  'Client publishTwitterAction was deleted in #2665 and must not be reintroduced.',
);
forbidSourceMatch(
  'apps/server/api/src/collections/source-posts/controllers/source-posts.controller.ts',
  /actions\/twitter/,
  'POST /source-posts/:id/actions/twitter was deleted in #2665 and must not be reintroduced.',
);
forbidSourceMatch(
  'apps/server/api/src/collections/workflows/services/workflow-automation-executor-registrar.service.ts',
  /['"]contentScheduleRun['"]/,
  'contentScheduleRun executor was deleted in #2665 and must not be reintroduced.',
);

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(`${violation.file}: ${violation.message}`);
  }
  process.exit(1);
}

console.log('Deleted audit orphans from #2665 remain deleted.');

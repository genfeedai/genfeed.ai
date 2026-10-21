import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const parse: (source: string) => unknown = createRequire(
  new URL('../../apps/server/api/package.json', import.meta.url),
)('yaml').parse;
const source = readFileSync(
  new URL('../../.github/workflows/e2e.yml', import.meta.url),
  'utf8',
);
const workflow = z
  .object({
    jobs: z.record(
      z.string(),
      z.object({ services: z.record(z.string(), z.unknown()).optional() }),
    ),
  })
  .parse(parse(source));

const postgres = {
  image: 'pgvector/pgvector:pg17',
  env: {
    POSTGRES_DB: 'test',
    POSTGRES_USER: 'genfeed',
    POSTGRES_PASSWORD: 'genfeed_local',
  },
  ports: ['5432:5432'],
  options:
    '--health-cmd "pg_isready -U genfeed -d test" --health-interval 5s --health-timeout 5s --health-retries 10',
};
const redis = {
  image: 'redis:7',
  ports: ['6379:6379'],
  options:
    '--health-cmd "redis-cli ping" --health-interval 5s --health-timeout 5s --health-retries 10',
};
const serviceJobs = [
  'e2e-api',
  'e2e-api-full',
  'e2e-isolated-publish',
  'runtime-acceptance',
  'agent-production-acceptance',
  'brand-acceptance',
  'e2e-frontend-authed',
];

describe('E2E resolved service configuration', () => {
  it('defines each identical service once at first use', () => {
    expect(source.match(/^ {8}image: pgvector\/pgvector:pg17$/gm)).toHaveLength(
      1,
    );
    expect(source.match(/^ {8}image: redis:7$/gm)).toHaveLength(1);
    expect(source).toMatch(/^ {6}postgres: &e2e-postgres$/m);
    expect(source).toMatch(/^ {6}redis: &e2e-redis$/m);
    expect(source.match(/^ {6}postgres: \*e2e-postgres$/gm)).toHaveLength(6);
    expect(source.match(/^ {6}redis: \*e2e-redis$/gm)).toHaveLength(5);
    expect(source).not.toMatch(/^\s*<<:/m);
  });

  it('preserves all job identities and the exact service consumers', () => {
    expect(Object.keys(workflow.jobs)).toEqual([
      'e2e-route-coverage',
      'e2e-api',
      'e2e-api-full',
      'e2e-isolated-publish',
      'e2e-frontend',
      'e2e-merge-reports',
      'runtime-acceptance',
      'agent-production-acceptance',
      'brand-acceptance',
      'e2e-api-full-gate',
      'e2e-gate',
      'e2e-frontend-authed',
      'nightly-failure-report',
      'nightly-recovery-report',
    ]);
    expect(
      Object.entries(workflow.jobs)
        .filter(([, job]) => job.services !== undefined)
        .map(([id]) => id),
    ).toEqual(serviceJobs);
  });

  it.each(serviceJobs)(
    '%s retains exact images, ports, readiness and fixture environment',
    (id) => {
      expect(workflow.jobs[id]?.services).toEqual(
        id === 'brand-acceptance' ? { postgres } : { postgres, redis },
      );
    },
  );
});

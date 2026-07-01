import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const protectedLoadingRoutes = [
  { route: 'loading.tsx', variant: 'minimal' },
  { route: 'settings/loading.tsx', variant: 'grid' },
  { route: 'admin/loading.tsx', variant: 'grid' },
  { route: '[orgSlug]/loading.tsx', variant: 'minimal' },
  { route: '[orgSlug]/~/loading.tsx', variant: 'grid' },
  { route: '[orgSlug]/~/agent/loading.tsx', variant: 'minimal' },
  { route: '[orgSlug]/~/overview/loading.tsx', variant: 'grid' },
  { route: '[orgSlug]/~/settings/loading.tsx', variant: 'grid' },
  { route: '[orgSlug]/[brandSlug]/loading.tsx', variant: 'grid' },
  { route: '[orgSlug]/[brandSlug]/analytics/loading.tsx', variant: 'grid' },
  {
    route: '[orgSlug]/[brandSlug]/analytics/overview/loading.tsx',
    variant: 'grid',
  },
  { route: '[orgSlug]/[brandSlug]/compose/loading.tsx', variant: 'grid' },
  { route: '[orgSlug]/[brandSlug]/editor/loading.tsx', variant: 'grid' },
  { route: '[orgSlug]/[brandSlug]/library/loading.tsx', variant: 'grid' },
  { route: '[orgSlug]/[brandSlug]/orchestration/loading.tsx', variant: 'grid' },
  { route: '[orgSlug]/[brandSlug]/overview/loading.tsx', variant: 'grid' },
  { route: '[orgSlug]/[brandSlug]/posts/loading.tsx', variant: 'grid' },
  { route: '[orgSlug]/[brandSlug]/research/loading.tsx', variant: 'grid' },
  { route: '[orgSlug]/[brandSlug]/settings/loading.tsx', variant: 'grid' },
  { route: '[orgSlug]/[brandSlug]/studio/loading.tsx', variant: 'grid' },
  { route: '[orgSlug]/[brandSlug]/tasks/loading.tsx', variant: 'grid' },
  { route: '[orgSlug]/[brandSlug]/workflows/loading.tsx', variant: 'grid' },
  { route: '[orgSlug]/[brandSlug]/workspace/loading.tsx', variant: 'grid' },
] as const;

describe('protected route loading coverage', () => {
  it.each(protectedLoadingRoutes)('keeps $route skeleton-first', ({
    route,
    variant,
  }) => {
    const routePath = join(process.cwd(), 'app/(protected)', route);

    expect(existsSync(routePath)).toBe(true);

    const source = readFileSync(routePath, 'utf8');

    expect(source).toContain(
      "import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback'",
    );
    expect(source).toContain(`variant="${variant}"`);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_RAIL_REGISTRY } from '@/components/shell/app-rail/app-rail.registry';

// The brand route each rail app opens, as the page file that serves it.
const railDestinationPages = [
  ...new Set(
    APP_RAIL_REGISTRY.map((app) =>
      app.route('org', 'brand').replace('/org/brand/', ''),
    ),
  ),
].map((route) => [
  route,
  join(__dirname, '[orgSlug]/[brandSlug]', route, 'page.tsx'),
]);

/**
 * A rail click paints at once only when the destination page is part of the
 * prerendered route shell. A page that awaits `params` or `searchParams` at its
 * top level prerenders as an empty hole, so the click waits for the server
 * render (about a second in production) even though the route was prefetched.
 * Read request data inside a Suspense boundary or a client route component.
 */
describe('rail destination pages stay in the prerendered shell', () => {
  it.each(railDestinationPages)(
    '%s reads no request data at the top of the page',
    (_route, file) => {
      const source = readFileSync(file, 'utf8');

      expect(source).not.toMatch(/export default async function/);
      expect(source).not.toMatch(/await\s+(?:params|searchParams)\b/);
    },
  );
});

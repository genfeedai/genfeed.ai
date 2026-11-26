import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SERVER_ROOT = join(__dirname, '../../../../..');
const SOURCE_ROOTS = [
  join(SERVER_ROOT, 'api/src'),
  join(SERVER_ROOT, 'workers/src'),
];

const APIFY_CALL = /(apifyService\b|researchCollectionRunner\.run\()/;
const NAMES_CALLER = /runWith(Default)?ApifyCaller\(/;

/**
 * Files that start Apify work only from inside an entry point that already
 * names itself, so their runs carry that entry point's caller.
 */
const NAMED_BY_ENTRY_POINT: Record<string, string> = {
  'api/src/collections/trends/services/modules/trend-fetch.service.ts':
    'reached from the Trends refresh cron and TrendsService, which name it',
  'api/src/collections/trends/services/modules/trend-video.service.ts':
    'reached from the Trends refresh cron and TrendsService, which name it',
};

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

const apifyCallers = SOURCE_ROOTS.flatMap(sourceFiles)
  .map((path) => relative(SERVER_ROOT, path))
  .filter((path) => !path.includes('integrations/apify/services/'))
  .filter((path) => !path.endsWith('.module.ts'))
  .filter((path) =>
    APIFY_CALL.test(readFileSync(join(SERVER_ROOT, path), 'utf8')),
  );

describe('Apify caller attribution', () => {
  it('finds the files that start Apify runs', () => {
    expect(apifyCallers.length).toBeGreaterThan(5);
  });

  it.each(apifyCallers)('%s names the caller of its Apify runs', (path) => {
    const source = readFileSync(join(SERVER_ROOT, path), 'utf8');
    expect(NAMES_CALLER.test(source) || path in NAMED_BY_ENTRY_POINT).toBe(
      true,
    );
  });

  it.each(Object.keys(NAMED_BY_ENTRY_POINT))(
    'keeps the %s exemption only while it calls Apify',
    (path) => {
      expect(apifyCallers).toContain(path);
    },
  );
});

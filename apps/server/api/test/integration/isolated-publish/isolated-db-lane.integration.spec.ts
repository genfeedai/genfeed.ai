/**
 * Isolated-DB publish lane smoke (#3837).
 *
 * Boots API + worker collaborators against the disposable Postgres URL and
 * refuses to start on a shared or production database.
 */
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { assertIsolatedDatabaseUrl } from '../../../scripts/assert-isolated-db-url';
import {
  createIsolatedPublishHarness,
  type IsolatedPublishHarness,
} from './isolated-publish.helpers';

describe('Isolated-DB publish lane (#3837)', () => {
  let harness: IsolatedPublishHarness;

  beforeAll(async () => {
    harness = await createIsolatedPublishHarness();
  });

  afterAll(async () => {
    await harness?.moduleRef.close();
  });

  it('refuses to start against a missing or production DATABASE_URL', () => {
    expect(() => assertIsolatedDatabaseUrl('')).toThrow(
      /DATABASE_URL is missing/,
    );
    expect(() =>
      assertIsolatedDatabaseUrl(
        'postgresql://genfeed:secret@ep-prod.neon.tech/genfeed',
      ),
    ).toThrow(/not a disposable local database/);
  });

  it('reports API health against the disposable database', async () => {
    const databaseUrl = assertIsolatedDatabaseUrl();
    expect(databaseUrl).toMatch(/test/i);

    const prisma = harness.moduleRef.get(PrismaService);
    const rows = await prisma.$queryRaw<{ healthy: number }[]>`
      SELECT 1 AS healthy
    `;
    expect(rows[0]?.healthy).toBe(1);
  });

  it('constructs worker publish collaborators against the same database', () => {
    expect(harness.cronPostsService).toBeDefined();
    expect(harness.postGroupsService).toBeDefined();
    expect(harness.fakePublisher).toBeDefined();
  });
});

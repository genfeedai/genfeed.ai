import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { Client } from 'pg';

vi.unmock('@genfeedai/prisma');

const connectionString = process.env.ACTIVITIES_TEST_DATABASE_URL;
if (connectionString) {
  const url = new URL(connectionString);
  if (!['localhost', '127.0.0.1', ''].includes(url.hostname)) {
    throw new Error(
      'ACTIVITIES_TEST_DATABASE_URL must point at a local disposable database',
    );
  }
}

/**
 * Org labels are attached from a real lookup keyed by id, which a mocked
 * `findMany` cannot prove. This runs the SELECT against a disposable local
 * PostgreSQL with a throwaway temp table.
 */
describe.skipIf(!connectionString)(
  'ActivitiesService organization labels on PostgreSQL',
  () => {
    const client = new Client({ connectionString });
    let service: ActivitiesService;

    beforeAll(async () => {
      await client.connect();
      await client.query(`
        CREATE TEMP TABLE organizations (id text, label text);
        INSERT INTO organizations (id, label) VALUES
          ('org-a', 'Acme Studio'),
          ('org-b', 'Bright Labs'),
          ('org-unused', 'Never Listed');
      `);
      const prisma = {
        organization: {
          findMany: async (args: { where: { id: { in: string[] } } }) =>
            (
              await client.query(
                'SELECT id, label FROM organizations WHERE id = ANY($1)',
                [args.where.id.in],
              )
            ).rows,
        },
      };
      service = new ActivitiesService(prisma as never, {} as never);
    });

    afterAll(async () => {
      await client.end();
    });

    const row = (id: string, organizationId: string | null) =>
      ({ id, organizationId }) as Parameters<
        typeof service.attachOrganizationLabels
      >[0][number];

    it('labels every row with its own organization name', async () => {
      const result = await service.attachOrganizationLabels([
        row('1', 'org-a'),
        row('2', 'org-b'),
        row('3', 'org-a'),
      ]);
      expect(result.map((r) => r.organizationLabel)).toEqual([
        'Acme Studio',
        'Bright Labs',
        'Acme Studio',
      ]);
    });

    it('leaves rows without a known organization unlabelled', async () => {
      const result = await service.attachOrganizationLabels([
        row('1', null),
        row('2', 'org-missing'),
      ]);
      expect(result.map((r) => r.organizationLabel)).toEqual([
        undefined,
        undefined,
      ]);
    });
  },
);

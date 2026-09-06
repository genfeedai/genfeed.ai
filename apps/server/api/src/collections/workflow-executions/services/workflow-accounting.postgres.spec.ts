import { readWorkflowAccounting } from '@api/collections/workflow-executions/services/workflow-accounting';
import { buildWorkflowCostCsv } from '@api/endpoints/cost-reporting/cost-reporting-export.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Opt-in against an isolated migrated database seeded with fixtures/workflow-accounting.sql.
const connectionString = process.env.WORKFLOW_ACCOUNTING_TEST_DATABASE_URL;
describe.skipIf(!connectionString)(
  'workflow accounting persisted ledger audit',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    afterAll(async () => {
      await prisma?.$disconnect();
    });
    it('reconciles exact node, execution, currency and CSV totals without foreign charges', async () => {
      const accounting = await readWorkflowAccounting(
        prisma as unknown as PrismaService,
        'accounting-org-72',
        'accounting-run-72',
      );
      expect(accounting?.actualCredits).toBe(0.27);
      expect(accounting?.actualProviderCostMicros).toBe(3000);
      expect(accounting?.varianceCredits).toBe(-0.03);
      expect(accounting?.varianceProviderCostMicros).toBe(-1000);
      expect(
        accounting?.nodes.map((node) => node.knownActualCredits).sort(),
      ).toEqual([0.07, 0.2]);
      const csv = buildWorkflowCostCsv([
        {
          id: 'accounting-run-72',
          workflowId: 'accounting-workflow-72',
          createdAt: '2026-09-05T09:00:00Z',
          accounting,
        },
      ]);
      expect(csv).toContain('0.3,0.27,0.27,');
      expect(csv).toContain('3000,3000');
      expect(
        await readWorkflowAccounting(
          prisma as unknown as PrismaService,
          'accounting-foreign-72',
          'accounting-run-72',
        ),
      ).toBeNull();
    });
  },
);

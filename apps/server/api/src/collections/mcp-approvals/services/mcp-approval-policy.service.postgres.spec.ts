import { randomUUID } from 'node:crypto';
import { McpApprovalPolicyService } from '@api/collections/mcp-approvals/services/mcp-approval-policy.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: use an isolated migrated database, never DATABASE_URL.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;

/**
 * Real Prisma client + real migrated database (#10592): the column defaults, not the
 * test, decide what a new organization and a new member get.
 */
describe.skipIf(!connectionString)(
  'McpApprovalPolicyService PostgreSQL defaults (#10592)',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const database = () => {
      if (!prisma) {
        throw new Error('BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL is required');
      }
      return prisma;
    };

    let userId: string;
    let organizationId: string;
    let service: McpApprovalPolicyService;

    beforeEach(async () => {
      const suffix = randomUUID();
      userId = `mcp-policy-user-${suffix}`;
      organizationId = `mcp-policy-org-${suffix}`;
      const db = database();
      await db.user.create({ data: { handle: userId, id: userId } });
      await db.organization.create({
        data: {
          id: organizationId,
          label: organizationId,
          slug: organizationId,
          userId,
        },
      });
      service = new McpApprovalPolicyService(db as unknown as PrismaService);
    });

    afterEach(async () => {
      const db = database();
      await db.setting.deleteMany({ where: { userId } });
      await db.organizationSetting.deleteMany({ where: { organizationId } });
      await db.organization.deleteMany({ where: { id: organizationId } });
      await db.user.deleteMany({ where: { id: userId } });
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    it('does not require approval for a new organization and a new member', async () => {
      const db = database();
      const organization = await db.organizationSetting.create({
        data: { organizationId },
      });
      const member = await db.setting.create({ data: { userId } });

      expect(organization.isMcpApprovalRequired).toBe(false);
      expect(member.isMcpApprovalRequired).toBe(false);
      await expect(
        service.isApprovalRequired(organizationId, userId),
      ).resolves.toBe(false);
    });

    it('does not require approval when neither row exists', async () => {
      await expect(
        service.isApprovalRequired(organizationId, userId),
      ).resolves.toBe(false);
    });

    it('requires approval when the organization turns it on', async () => {
      const db = database();
      await db.organizationSetting.create({
        data: { isMcpApprovalRequired: true, organizationId },
      });
      await db.setting.create({ data: { userId } });

      await expect(
        service.isApprovalRequired(organizationId, userId),
      ).resolves.toBe(true);
    });

    it('requires approval when the member turns it on', async () => {
      const db = database();
      await db.organizationSetting.create({ data: { organizationId } });
      await db.setting.create({
        data: { isMcpApprovalRequired: true, userId },
      });

      await expect(
        service.isApprovalRequired(organizationId, userId),
      ).resolves.toBe(true);
    });

    it('requires approval when the read fails', async () => {
      const failing = new McpApprovalPolicyService({
        organizationSetting: {
          findFirst: () => Promise.reject(new Error('database unavailable')),
        },
        setting: { findFirst: () => Promise.resolve(null) },
      } as unknown as PrismaService);

      await expect(
        failing.isApprovalRequired(organizationId, userId),
      ).resolves.toBe(true);
    });
  },
);

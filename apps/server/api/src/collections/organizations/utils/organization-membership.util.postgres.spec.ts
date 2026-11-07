import {
  creatorOrganizationOfMemberWhere,
  organizationsOfMemberWhere,
} from '@api/collections/organizations/utils/organization-membership.util';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

/**
 * Prisma validates a query's argument shape before it opens a connection, so
 * the real generated client pointed at an address nothing listens on proves the
 * shape: a malformed filter throws `PrismaClientValidationError`, a valid one
 * only fails to reach the database. The subscription endpoint and the user
 * checkout webhook used to pass `members: userId`, which failed validation on
 * every call (API-GENFEED-AI-9E).
 */
const UNREACHABLE_DATABASE_URL = 'postgresql://user:pass@127.0.0.1:1/genfeed';
const CANT_REACH_DATABASE = /can't reach database server/i;

describe('organization membership filters (real Prisma client, no database)', () => {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: UNREACHABLE_DATABASE_URL }),
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  it.each([
    ['any organization of the member', organizationsOfMemberWhere('user_1')],
    ['the creator organization', creatorOrganizationOfMemberWhere('user_1')],
  ])('%s is a valid organization filter', async (_label, where) => {
    await expect(
      client.organization.findFirst({ select: { id: true }, where }),
    ).rejects.toThrow(CANT_REACH_DATABASE);
  });

  it('rejects the bare user id the callers used to pass', async () => {
    await expect(
      client.organization.findFirst({
        select: { id: true },
        where: { members: 'user_1' } as never,
      }),
    ).rejects.toThrow(/Expected MemberListRelationFilter/);
  });
});

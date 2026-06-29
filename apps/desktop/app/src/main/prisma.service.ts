import type { PGlite } from '@electric-sql/pglite';
import type { PrismaClient } from '@genfeedai/desktop-prisma';
import { createDesktopPrismaClient } from '@genfeedai/desktop-prisma';
import { toIso } from './time.util';

const LOCAL_ORGANIZATION_ID = 'local-org';
const DEFAULT_LOCAL_USER_ID = 'local-user';

export class DesktopPrismaService {
  private client: PrismaClient | null = null;

  constructor(private readonly pglite: PGlite) {}

  getClient(): PrismaClient {
    if (!this.client) {
      this.client = createDesktopPrismaClient(this.pglite);
    }

    return this.client;
  }

  async bootstrapLocalIdentity(
    localUserId = DEFAULT_LOCAL_USER_ID,
  ): Promise<void> {
    const client = this.getClient();
    const now = toIso();

    await client.organization.upsert({
      create: {
        createdAt: now,
        id: LOCAL_ORGANIZATION_ID,
        name: 'Local Workspace',
        slug: 'local-workspace',
        updatedAt: now,
      },
      update: {
        name: 'Local Workspace',
        updatedAt: now,
      },
      where: {
        id: LOCAL_ORGANIZATION_ID,
      },
    });

    await client.user.upsert({
      create: {
        createdAt: now,
        id: localUserId,
        name: 'Local Desktop User',
        organizationId: LOCAL_ORGANIZATION_ID,
        updatedAt: now,
      },
      update: {
        name: 'Local Desktop User',
        updatedAt: now,
      },
      where: {
        id: localUserId,
      },
    });
  }
}

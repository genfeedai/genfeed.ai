import fs from 'node:fs';
import type { PrismaClient } from '@genfeedai/desktop-prisma';
import { LegacySqliteReader } from './cloud-database.service';

const MIGRATION_FLAG_KEY = 'sqlite_migration_complete';

export class DesktopSqliteMigratorService {
  static async migrate(
    prismaClient: PrismaClient,
    oldSqlitePath: string,
  ): Promise<void> {
    const migrationFlag = await prismaClient.desktopKv.findUnique({
      where: { key: MIGRATION_FLAG_KEY },
    });

    if (migrationFlag) {
      return;
    }

    if (!fs.existsSync(oldSqlitePath)) {
      await prismaClient.desktopKv.upsert({
        create: { key: MIGRATION_FLAG_KEY, value: '1' },
        update: { value: '1' },
        where: { key: MIGRATION_FLAG_KEY },
      });
      return;
    }

    const reader = LegacySqliteReader.tryOpen(oldSqlitePath);

    if (!reader) {
      return;
    }

    try {
      const [kvRows, workspaceRows, syncJobRows, recentRows] = [
        reader.readKvStore(),
        reader.readWorkspaceRegistry(),
        reader.readSyncJobs(),
        reader.readRecentItems(),
      ];

      await prismaClient.$transaction(async (tx) => {
        for (const row of kvRows) {
          await tx.desktopKv.upsert({
            create: row,
            update: { value: row.value },
            where: { key: row.key },
          });
        }

        for (const row of workspaceRows) {
          await tx.desktopWorkspace.upsert({
            create: row,
            update: row,
            where: { id: row.id },
          });
        }

        for (const row of syncJobRows) {
          await tx.desktopSyncJob.upsert({
            create: row,
            update: row,
            where: { id: row.id },
          });
        }

        for (const row of recentRows) {
          await tx.desktopRecentItem.upsert({
            create: row,
            update: row,
            where: { id: row.id },
          });
        }

        await tx.desktopKv.upsert({
          create: { key: MIGRATION_FLAG_KEY, value: '1' },
          update: { value: '1' },
          where: { key: MIGRATION_FLAG_KEY },
        });
      });
    } finally {
      reader.close();
    }
  }
}

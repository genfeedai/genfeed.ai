import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20260822120000_add_durable_workflow_notifications/migration.sql',
  ),
  'utf8',
);

describe('durable workflow notifications (#3359)', () => {
  it('models event, preference, and delivery as separate durable records', () => {
    expect(schema).toContain('model NotificationEvent');
    expect(schema).toContain('model NotificationPreference');
    expect(schema).toContain('model NotificationDelivery');
    expect(schema).toContain('deduplicationKey String                 @unique');
    expect(schema).toContain('providerMessageId String?');
    expect(schema).toContain(
      '@@unique([eventId, userId, channel], map: "notification_deliveries_event_user_channel_key")',
    );
    expect(schema).toContain(
      '@@index([status, nextAttemptAt, isDeleted], map: "notification_deliveries_due_idx")',
    );
  });

  it('backfills legacy workflow email opt-ins before dropping the old column', () => {
    const backfillIndex = migration.indexOf(
      'INSERT INTO "notification_preferences"',
    );
    const dropIndex = migration.indexOf(
      'ALTER TABLE "settings" DROP COLUMN "isWorkflowNotificationsEmail"',
    );

    expect(backfillIndex).toBeGreaterThan(-1);
    expect(dropIndex).toBeGreaterThan(backfillIndex);
    expect(migration).toContain(
      'WHERE settings."isWorkflowNotificationsEmail" = true',
    );
    expect(migration).toContain('users."isDeleted" = false');
    expect(migration).toContain('settings."isDeleted" = false');
    expect(schema).not.toContain('isWorkflowNotificationsEmail');
  });
});

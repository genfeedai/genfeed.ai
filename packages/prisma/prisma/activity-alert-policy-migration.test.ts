import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20260927160000_activity_alert_policy/migration.sql',
  ),
  'utf8',
);
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');

describe('activity alert policy migration (#5197)', () => {
  it('links events and inbox items to their activity', () => {
    expect(migration).toContain(
      'ALTER TABLE "notification_events"\n  ALTER COLUMN "organizationId" DROP NOT NULL,\n  ADD COLUMN "activityId" TEXT;',
    );
    expect(migration).toContain(
      'ALTER TABLE "notification_inbox_items" ADD COLUMN "activityId" TEXT;',
    );
    expect(migration).toMatch(
      /FOREIGN KEY \("activityId"\) REFERENCES "activities"\("id"\) ON DELETE SET NULL/,
    );
    expect(schema).toMatch(/activityId\s+String\?\n\s+activity\s+Activity\?/);
  });

  it('lets channel deliveries carry a destination and rendered message', () => {
    expect(migration).toContain('ALTER COLUMN "userId" DROP NOT NULL');
    expect(migration).toContain('ADD COLUMN "destination" TEXT');
    expect(migration).toContain('ADD COLUMN "message" JSONB');
  });

  it('materializes bell items from in-app deliveries only, copying the activity', () => {
    const body = migration.match(
      /FUNCTION materialize_notification_inbox_item\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/,
    )?.[1];
    expect(body).toContain(
      `IF NEW."channel" = 'in_app' AND NEW."userId" IS NOT NULL`,
    );
    expect(body).toContain('e."activityId"');
    expect(body).not.toContain(`'workflow.status'`);
  });
});

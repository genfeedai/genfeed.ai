import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));

function readMigration(name: string): string {
  return readFileSync(
    join(prismaDir, `migrations/${name}/migration.sql`),
    'utf8',
  );
}

function functionBody(source: string): string {
  const match = source.match(
    /FUNCTION materialize_notification_inbox_item\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/,
  );
  return match?.[1] ?? '';
}

describe('social.reply inbox materialization migration', () => {
  const original = functionBody(
    readMigration('20260905140000_notification_inbox'),
  );
  const extended = functionBody(
    readMigration('20260925160000_social_reply_notifications'),
  );

  it('extends only the materialized topic list', () => {
    expect(original).not.toBe('');
    expect(extended).toContain(
      `IN ('workflow.status', 'agent.status', 'social.reply')`,
    );
    expect(
      extended.replace(
        `IN ('workflow.status', 'agent.status', 'social.reply')`,
        `IN ('workflow.status', 'agent.status')`,
      ),
    ).toBe(original);
  });
});

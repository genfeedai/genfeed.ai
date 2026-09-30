import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schemaSource = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260819200000_lowercase_posts_platform/migration.sql',
  ),
  'utf8',
);
const postModel = schemaSource.slice(
  schemaSource.indexOf('model Post {'),
  schemaSource.indexOf('model PublishApproval {'),
);
const credentialModel = schemaSource.slice(
  schemaSource.indexOf('model Credential {'),
  schemaSource.indexOf('model SocialWarmupEnrollment {'),
);
const postAnalyticsModel = schemaSource.slice(
  schemaSource.indexOf('model PostAnalytics {'),
  schemaSource.indexOf('model Schedule {'),
);

describe('posts.platform casing migration (#3274)', () => {
  it('keeps Post.platform as a nullable String — not a Prisma enum', () => {
    expect(postModel).toMatch(/platform\s+String\?/u);
    expect(postModel).toContain('@@map("posts")');
    expect(postModel).not.toMatch(/platform\s+CredentialPlatform/u);
  });

  it('leaves credentials.platform and post_analytics.platform as SCREAMING enums', () => {
    expect(credentialModel).toMatch(/platform\s+CredentialPlatform/u);
    expect(credentialModel).toContain('@@map("credentials")');
    expect(postAnalyticsModel).toMatch(/platform\s+CredentialPlatform/u);
    expect(postAnalyticsModel).toContain('@@map("post_analytics")');
  });

  it('lowercases non-null posts.platform rows and stays idempotent', () => {
    expect(migrationSource).toContain(
      'UPDATE "posts"\nSET "platform" = lower("platform")\nWHERE "platform" IS NOT NULL\n  AND "platform" <> lower("platform");',
    );
  });

  it('does not lowercase Prisma enum platform columns', () => {
    expect(migrationSource).not.toContain('UPDATE "credentials"');
    expect(migrationSource).not.toContain('UPDATE "post_analytics"');
    expect(migrationSource).not.toMatch(
      /UPDATE\s+"(?!posts")[^"]+"\s+SET\s+"platform"/u,
    );
  });
});

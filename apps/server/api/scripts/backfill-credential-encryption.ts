/**
 * Backfill Script: Encrypt Credential secrets at rest
 *
 * One-time data migration that encrypts any plaintext secret columns on the
 * `credentials` table (access/refresh tokens and token secrets). Values that
 * are already in the ciphertext envelope are skipped, so the script is
 * idempotent and safe to re-run.
 *
 * The cipher (aes-256-gcm), key derivation (sha256(TOKEN_ENCRYPTION_KEY)) and
 * envelope format (iv:ciphertext:authTag hex) match both `EncryptionUtil` and
 * `CredentialCryptoService`, so backfilled values decrypt through every read
 * path. Because the read paths treat plaintext as a no-op, this script can be
 * run independently of (and after) deploying the encrypt-on-write boundary.
 *
 * Dry-run is the default. Pass `--live` to write changes.
 *
 * Usage:
 *   bun run apps/server/api/scripts/backfill-credential-encryption.ts
 *   bun run apps/server/api/scripts/backfill-credential-encryption.ts --live
 *   bun run apps/server/api/scripts/backfill-credential-encryption.ts --batch=200 --live
 *
 * Requires DATABASE_URL and TOKEN_ENCRYPTION_KEY in the environment.
 */

import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import process from 'node:process';
import { PrismaClient } from '@genfeedai/prisma';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

const logger = new Logger('CredentialEncryptionBackfill');

const SECRET_FIELDS = [
  'accessToken',
  'accessTokenSecret',
  'oauthToken',
  'oauthTokenSecret',
  'refreshToken',
] as const;

type SecretField = (typeof SECRET_FIELDS)[number];

const GCM_ALGORITHM = 'aes-256-gcm';
const CIPHERTEXT_PATTERN = /^[0-9a-f]{32}:(?:[0-9a-f]{2})+:[0-9a-f]{32}$/i;

function getKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required to run this backfill');
  }
  return createHash('sha256').update(secret).digest();
}

function isEncrypted(value: string): boolean {
  return CIPHERTEXT_PATTERN.test(value);
}

function encrypt(value: string, key: Buffer): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(GCM_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
}

function parseArgs(): { dryRun: boolean; batchSize: number } {
  const args = process.argv.slice(2);
  const batchArg = args
    .find((arg) => arg.startsWith('--batch='))
    ?.split('=')[1];
  return {
    batchSize: batchArg ? Math.max(1, Number.parseInt(batchArg, 10)) : 100,
    dryRun: !args.includes('--live'),
  };
}

async function main(): Promise<void> {
  const { dryRun, batchSize } = parseArgs();
  const key = getKey();

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter, log: ['error'] });

  const fieldSelect = Object.fromEntries(
    SECRET_FIELDS.map((field) => [field, true]),
  );

  const counts = {
    fieldsEncrypted: Object.fromEntries(
      SECRET_FIELDS.map((field) => [field, 0]),
    ) as Record<SecretField, number>,
    rowsScanned: 0,
    rowsUpdated: 0,
  };

  logger.log(
    `Starting credential encryption backfill (${dryRun ? 'DRY-RUN' : 'LIVE'}), batch size ${batchSize}`,
  );

  try {
    let cursor: string | undefined;

    for (;;) {
      const rows = await prisma.credential.findMany({
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { id: 'asc' },
        select: { id: true, ...fieldSelect },
        skip: cursor ? 1 : 0,
        take: batchSize,
      });

      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        counts.rowsScanned += 1;
        const update: Partial<Record<SecretField, string>> = {};

        for (const field of SECRET_FIELDS) {
          const value = (row as Record<string, unknown>)[field];
          if (
            typeof value === 'string' &&
            value.length > 0 &&
            !isEncrypted(value)
          ) {
            update[field] = encrypt(value, key);
            counts.fieldsEncrypted[field] += 1;
          }
        }

        if (Object.keys(update).length > 0) {
          counts.rowsUpdated += 1;
          if (!dryRun) {
            await prisma.credential.update({
              data: update,
              where: { id: row.id },
            });
          }
        }
      }

      cursor = rows[rows.length - 1]?.id;
    }

    logger.log(
      `Backfill ${dryRun ? '(dry-run) ' : ''}complete: scanned ${counts.rowsScanned}, ${dryRun ? 'would update' : 'updated'} ${counts.rowsUpdated} rows`,
    );
    logger.log(
      `Per-field encrypted counts: ${JSON.stringify(counts.fieldsEncrypted)}`,
    );

    if (dryRun) {
      logger.log('Re-run with --live to apply these changes.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  logger.error('Credential encryption backfill failed', error);
  process.exit(1);
});

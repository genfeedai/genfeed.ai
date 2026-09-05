/**
 * One-time credential encryption, after encrypt-on-write services are stable.
 * Defaults to dry-run. Use --live to apply and record durable completion.
 * See docs/deployment-data-upgrades.md for retry and rollback semantics.
 */
import process from 'node:process';
import {
  createPrismaPgConfig,
  POSTGRES_CA_FILE_ENV_KEYS,
} from '@libs/prisma/prisma-pg-config';
import { Logger } from '@nestjs/common';
import { Client } from 'pg';
import {
  parseCredentialBackfillArgs,
  runCredentialEncryptionBackfill,
} from './credential-encryption-backfill';

const logger = new Logger('CredentialEncryptionBackfill');

async function main(): Promise<void> {
  const args = parseCredentialBackfillArgs(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const client = new Client(
    createPrismaPgConfig(connectionString, {
      caFilePaths: POSTGRES_CA_FILE_ENV_KEYS.map((key) => process.env[key]),
    }),
  );
  await client.connect();
  try {
    const report = await runCredentialEncryptionBackfill(
      client,
      args,
      process.env.TOKEN_ENCRYPTION_KEY ?? '',
    );
    logger.log(
      `Credential backfill ${args.dryRun ? '(dry-run)' : '(live)'}: ${JSON.stringify(report)}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  logger.error('Credential encryption backfill failed', error);
  process.exit(1);
});

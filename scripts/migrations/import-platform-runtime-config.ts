/** Run against the upgraded database with the old environment still loaded. */
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { DEFAULT_PLATFORM_FEATURE_SETTINGS } from '../../packages/contracts/src/constants/platform-feature-settings.constant';
import { PLATFORM_SETTING_KEY } from '../../packages/contracts/src/constants/platform-settings.constant';
import {
  deriveEncryptionKey,
  encryptWithKey,
} from '../../packages/libs/crypto/credential-cipher';
import { SYSTEM_EVENT_TYPES } from '../../packages/libs/interfaces/system-event.interface';
import { discordWebhookUrl } from '../../packages/libs/security/discord-webhook-url';
import { PrismaClient } from '../../packages/prisma/generated/prisma/client/client';
import { legacyRuntimeSettings } from './platform-runtime-config.util';

async function main(): Promise<void> {
  const settings = legacyRuntimeSettings(process.env);
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: standalone one-time CLI, never cached by Turbo
  const webhook = process.env.SYSTEM_NOTIFICATIONS_DISCORD_WEBHOOK_URL?.trim();
  if (webhook && !discordWebhookUrl(webhook))
    throw new Error('Invalid legacy Discord webhook');
  const encrypted = webhook
    ? encryptWithKey(
        // biome-ignore lint/suspicious/noUndeclaredEnvVars: standalone one-time CLI, never cached by Turbo
        deriveEncryptionKey(process.env.TOKEN_ENCRYPTION_KEY ?? ''),
        webhook,
      )
    : null;
  console.log(
    `Legacy settings present: ${Object.keys(settings).join(', ') || 'none'}. Discord destination: ${Boolean(webhook)}.`,
  );
  if (!process.argv.includes('--apply')) {
    console.log(
      'Dry run. Use --apply after applying the schema migration. No values or credentials are printed.',
    );
    return;
  }
  // biome-ignore lint/suspicious/noUndeclaredEnvVars: standalone one-time CLI, never cached by Turbo
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  try {
    await prisma.$transaction(async (tx) => {
      // tenant-scope-ignore: deployment singleton import before the new application starts
      const row = await tx.platformSetting.upsert({
        where: { key: PLATFORM_SETTING_KEY },
        create: { key: PLATFORM_SETTING_KEY },
        update: {},
      });
      if (row.isDeleted) throw new Error('Platform settings are deleted');
      for (const [key, value] of Object.entries(settings)) {
        const defaultValue = Reflect.get(
          DEFAULT_PLATFORM_FEATURE_SETTINGS,
          key,
        );
        // Only untouched defaults are imported; existing admin changes win.
        // tenant-scope-ignore: compare-and-set import into one deployment singleton
        await tx.platformSetting.updateMany({
          where: { id: row.id, isDeleted: false, [key]: defaultValue },
          data: { [key]: value },
        });
      }
      if (encrypted) {
        // tenant-scope-ignore: serialize reruns of the legacy destination import
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('system-notification-destinations'))`;
        // tenant-scope-ignore: never duplicate or replace an existing admin destination
        const existing = await tx.systemNotificationDestination.count({
          where: { isDeleted: false },
        });
        if (existing === 0) {
          // tenant-scope-ignore: preserve the old deployment notification route
          await tx.systemNotificationDestination.create({
            data: {
              id: randomUUID(),
              label: 'Imported Discord notifications',
              provider: 'discord',
              webhookEncrypted: encrypted,
              eventTypes: [...SYSTEM_EVENT_TYPES],
              isEnabled: true,
            },
          });
        }
      }
    });
    console.log(
      'Runtime configuration imported. Existing admin overrides and destinations were preserved.',
    );
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error(
    'Runtime configuration import failed. Check configuration, encryption key, and database migration; no credentials were logged.',
  );
  process.exitCode = 1;
});

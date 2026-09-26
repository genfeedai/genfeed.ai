import { SocialReplyNotificationService } from '@api/services/notifications/social-reply-notifications/social-reply-notification.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PrismaClient } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

/**
 * No real database is required here. Prisma validates a query's argument
 * SHAPE against its generated DMMF before it ever opens a connection, so the
 * real generated client, pointed at an address nothing listens on, still
 * proves whether an argument shape is valid: `PrismaClientValidationError`
 * for a malformed one, "Can't reach database server" for a well-formed one
 * that only fails once it tries to connect.
 *
 * `markConversationRepliesRead`'s `notificationInboxItem.findMany` call
 * filters a *related* model's Json field — `event.payload` — with
 * `array_contains`/`path`. Every other spec for that method mocks Prisma, so
 * none of them can catch this exact shape breaking (a mock never runs the
 * real argument parser); this file sends the production query, unmodified,
 * through it instead of a re-typed copy that could drift from the
 * implementation.
 *
 * If this ever starts throwing `PrismaClientValidationError`, the service's
 * own catch block now rethrows it rather than swallowing it — see the
 * "never swallows a broken query shape" spec next to the mocked ones.
 */
const UNREACHABLE_DATABASE_URL = 'postgresql://user:pass@127.0.0.1:1/genfeed';
const CANT_REACH_DATABASE = /can't reach database server/i;

describe('SocialReplyNotificationService.findUnreadInboxItemsCoveringConversation argument shape (real Prisma client, no database)', () => {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: UNREACHABLE_DATABASE_URL }),
  });
  const logger = { error: vi.fn(), warn: vi.fn() } as unknown as LoggerService;
  const service = new SocialReplyNotificationService(
    client as unknown as PrismaService,
    logger,
  );

  afterAll(async () => {
    await client.$disconnect();
  });

  it('a well-formed array_contains/path filter on the related event.payload only fails at the connection, never at validation', async () => {
    await expect(
      service['findUnreadInboxItemsCoveringConversation'](
        'org_1',
        'conversation_1',
      ),
    ).rejects.toThrow(CANT_REACH_DATABASE);
  });
});

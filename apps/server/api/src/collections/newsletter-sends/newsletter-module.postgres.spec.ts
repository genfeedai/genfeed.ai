import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import {
  type NewsletterBrandLook,
  NewsletterEmailService,
} from '@api/collections/newsletter-sends/services/newsletter-email.service';
import { NewsletterProviderEventsService } from '@api/collections/newsletter-sends/services/newsletter-provider-events.service';
import { NewsletterRecipientAccessService } from '@api/collections/newsletter-sends/services/newsletter-recipient-access.service';
import { NewsletterSendsService } from '@api/collections/newsletter-sends/services/newsletter-sends.service';
import type { NewsletterSettingsService } from '@api/collections/newsletter-sends/services/newsletter-settings.service';
import type { NewsletterUsageService } from '@api/collections/newsletter-sends/services/newsletter-usage.service';
import { subscriberEmailHash } from '@api/collections/newsletter-sends/utils/newsletter-token.util';
import { BrandSubscribersService } from '@api/collections/newsletter-subscribers/services/brand-subscribers.service';
import type { NewslettersService } from '@api/collections/newsletters/services/newsletters.service';
import type { NotificationsService } from '@api/services/notifications/notifications.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IEmailDeliveryRequest } from '@genfeedai/contracts/interfaces';
import { PrismaClient } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
// Share CI's explicitly provisioned verification DB; isolate every fixture in
// its own schema. Never use DATABASE_URL or production configuration.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;

const MIGRATION_SQL = readFileSync(
  path.resolve(
    __dirname,
    '../../../../../../packages/prisma/prisma/migrations/20261109093000_newsletter_module/migration.sql',
  ),
  'utf8',
);

describe.skipIf(!connectionString)(
  'Newsletter subscribers and sends on PostgreSQL (#9724, #9726)',
  () => {
    const schema = `newsletter_${randomUUID().replaceAll('-', '')}`;
    const organizationId = 'org-newsletter';
    const user = {
      organizationId,
      userId: 'user-owner',
    } as AuthenticatedUser;
    let pool: Pool;
    let prisma: PrismaClient;
    let subscribers: BrandSubscribersService;
    let sends: NewsletterSendsService;
    /** Every email handed to the notifications app, in order. */
    let outbox: IEmailDeliveryRequest[];
    let hasSubscriberCapacity = true;
    /** Emails left this month; null is a plan without a cap. */
    let remainingEmails: number | null = null;

    beforeAll(async () => {
      if (!connectionString)
        throw new Error('Explicit disposable database required');
      const url = new URL(connectionString);
      if (
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        !['/billing_scope_test', '/genfeed_6507_disposable'].includes(
          url.pathname,
        )
      )
        throw new Error('Disposable local database required');
      pool = new Pool({ connectionString });
      await pool.query(`CREATE SCHEMA "${schema}"`);
      await pool.query(`SET search_path TO "${schema}"`);
      const client = await pool.connect();
      try {
        await client.query(`SET search_path TO "${schema}"`);
        await client.query(
          `CREATE TABLE "brands" ("id" text PRIMARY KEY, "organizationId" text NOT NULL, "label" text NOT NULL, "slug" text NOT NULL, "isDeleted" boolean NOT NULL DEFAULT false)`,
        );
        await client.query(
          `CREATE TABLE "newsletters" ("id" text PRIMARY KEY, "organizationId" text NOT NULL, "brandId" text, "label" text NOT NULL, "isDeleted" boolean NOT NULL DEFAULT false)`,
        );
        await client.query(
          `CREATE TABLE "email_suppressions" ("recipientHash" text PRIMARY KEY, "reason" text NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        );
        await client.query(
          `CREATE TABLE "email_provider_events" ("id" text PRIMARY KEY, "providerMessageId" text NOT NULL, "eventType" text NOT NULL, "occurredAt" timestamp(3) NOT NULL, "processedAt" timestamp(3), "lastAttemptAt" timestamp(3), "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
        );
        // The real migration builds every newsletter table under test.
        await client.query(MIGRATION_SQL);
      } finally {
        client.release();
      }
      url.searchParams.set('options', `-c search_path=${schema}`);
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url.toString() }, { schema }),
      });
      const db = prisma as unknown as PrismaService;
      const notifications = {
        deliverEmail: async (request: IEmailDeliveryRequest) => {
          outbox.push(request);
          return `msg-${outbox.length}-${randomUUID()}`;
        },
      } as unknown as NotificationsService;
      const config = {
        apiUrl: 'https://api.genfeed.test',
        get: (key: string) =>
          key === 'TOKEN_ENCRYPTION_KEY' ? 'k'.repeat(32) : undefined,
      } as unknown as ConfigService;
      const emails = new NewsletterEmailService(
        db,
        {} as NewsletterSettingsService,
        notifications,
        config,
      );
      vi.spyOn(emails, 'getBrandLook').mockImplementation(
        async (orgId, brandId) =>
          ({
            brand: {
              backgroundColor: null,
              bannerUrl: null,
              label: 'Field Notes',
              logoUrl: null,
              primaryColor: null,
            },
            brandId,
            footer: {
              attributionUrl: 'https://genfeed.ai',
              footerText: null,
              isAttributionEnabled: true,
              postalAddress: null,
              senderName: 'Field Notes',
            },
            fromName: 'Field Notes',
            organizationId: orgId,
            settings: {
              isWelcomeEnabled: false,
              replyTo: null,
              welcomeBody: null,
              welcomeSubject: null,
            },
            slug: 'field-notes',
          }) as unknown as NewsletterBrandLook,
      );
      const usage = {
        assertSendCapacity: async () => undefined,
        assertSubscriberCapacity: async () => undefined,
        hasSubscriberCapacity: async () => hasSubscriberCapacity,
        remainingEmails: async () => remainingEmails,
      } as unknown as NewsletterUsageService;
      const logger = { warn: () => undefined } as unknown as LoggerService;
      const brandAccess = {
        assert: async () => undefined,
      } as unknown as BrandAccessService;
      subscribers = new BrandSubscribersService(
        db,
        brandAccess,
        emails,
        usage,
        logger,
      );
      sends = new NewsletterSendsService(
        db,
        brandAccess,
        {} as NewslettersService,
        emails,
        usage,
        new NewsletterRecipientAccessService(),
        new NewsletterProviderEventsService(db),
        logger,
      );
    });

    afterAll(async () => {
      await prisma?.$disconnect();
      if (pool) {
        await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await pool.end();
      }
    });

    beforeEach(() => {
      hasSubscriberCapacity = true;
      remainingEmails = null;
      outbox = [];
    });

    async function seedBrand(): Promise<string> {
      const brandId = randomUUID();
      await pool.query(
        `INSERT INTO "${schema}"."brands" ("id","organizationId","label","slug") VALUES ($1,$2,'Field Notes','field-notes')`,
        [brandId, organizationId],
      );
      return brandId;
    }

    async function seedSubscriber(
      brandId: string,
      email: string,
      status: string,
    ): Promise<string> {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO "${schema}"."brand_subscribers" ("id","organizationId","brandId","email","emailHash","status","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now())`,
        [
          id,
          organizationId,
          brandId,
          email,
          subscriberEmailHash(email),
          status,
        ],
      );
      return id;
    }

    async function statusesOf(
      brandId: string,
    ): Promise<Record<string, string>> {
      const rows = await pool.query<{ email: string; status: string }>(
        `SELECT "email","status" FROM "${schema}"."brand_subscribers" WHERE "brandId"=$1 AND "isDeleted"=false ORDER BY "email"`,
        [brandId],
      );
      return Object.fromEntries(
        rows.rows.map((row) => [row.email, row.status]),
      );
    }

    async function seedSend(brandId: string): Promise<string> {
      const newsletterId = randomUUID();
      const sendId = randomUUID();
      await pool.query(
        `INSERT INTO "${schema}"."newsletters" ("id","organizationId","brandId","label") VALUES ($1,$2,$3,'Issue 1')`,
        [newsletterId, organizationId, brandId],
      );
      await pool.query(
        `INSERT INTO "${schema}"."newsletter_sends" ("id","organizationId","brandId","newsletterId","userId","idempotencyKey","scheduledFor","subject","html","text","links","updatedAt") VALUES ($1,$2,$3,$4,'user-owner',$5,now() - interval '1 minute','Issue 1','<p>Hi</p><a href="{{link:0}}">Read</a><a href="{{unsubscribeUrl}}">Unsubscribe</a>','Hi {{unsubscribeUrl}}','["https://example.com/post"]'::jsonb,now())`,
        [
          sendId,
          organizationId,
          brandId,
          newsletterId,
          `newsletter/${newsletterId}`,
        ],
      );
      return sendId;
    }

    it('imports only new, valid, unsuppressed addresses', async () => {
      const brandId = await seedBrand();
      await seedSubscriber(brandId, 'listed@example.com', 'active');
      await seedSubscriber(brandId, 'left@example.com', 'unsubscribed');
      await pool.query(
        `INSERT INTO "${schema}"."email_suppressions" ("recipientHash","reason") VALUES ($1,'email.bounced')`,
        [subscriberEmailHash('bounced@example.com')],
      );

      const summary = await subscribers.importCsv(user, brandId, {
        csv: 'email,name\nnew@example.com,New Reader\nLISTED@example.com,\nnot-an-email,\nleft@example.com,\nbounced@example.com,\n',
        hasConsent: true,
        isPreview: false,
      });

      expect(summary).toMatchObject({
        added: 1,
        duplicate: 1,
        invalid: 1,
        suppressed: 2,
        totalRows: 5,
      });
      expect(await statusesOf(brandId)).toEqual({
        'left@example.com': 'unsubscribed',
        'listed@example.com': 'active',
        'new@example.com': 'active',
      });
      expect(outbox).toEqual([]);
    });

    it('activates a public sign-up only after the emailed confirmation', async () => {
      const brandId = await seedBrand();

      await subscribers.subscribePublic(
        { brandId, email: 'Reader@Example.com', source: 'profile' },
        '203.0.113.9',
      );
      expect(await statusesOf(brandId)).toEqual({
        'reader@example.com': 'pending',
      });
      const confirmation = outbox[0];
      const token = /public\/newsletter\/confirm\/([A-Za-z0-9_-]{43})/.exec(
        confirmation?.html ?? '',
      )?.[1];
      expect(confirmation?.to).toBe('reader@example.com');

      expect(await subscribers.confirm(token ?? '')).toEqual({
        brandLabel: 'Field Notes',
        brandSlug: 'field-notes',
        isListFull: false,
      });
      expect(await statusesOf(brandId)).toEqual({
        'reader@example.com': 'active',
      });
      // The token is single use.
      expect(await subscribers.confirm(token ?? '')).toBeNull();
    });

    it('answers a public sign-up to a full list exactly like a listed address', async () => {
      const brandId = await seedBrand();
      hasSubscriberCapacity = false;

      await expect(
        subscribers.subscribePublic(
          { brandId, email: 'new@example.com', source: 'profile' },
          '203.0.113.9',
        ),
      ).resolves.toBeUndefined();
      expect(await statusesOf(brandId)).toEqual({});
      expect(outbox).toEqual([]);
    });

    it('keeps a confirmed reader pending while the list is full', async () => {
      const brandId = await seedBrand();
      await subscribers.subscribePublic(
        { brandId, email: 'late@example.com', source: 'profile' },
        null,
      );
      const token = /public\/newsletter\/confirm\/([A-Za-z0-9_-]{43})/.exec(
        outbox[0]?.html ?? '',
      )?.[1];
      hasSubscriberCapacity = false;

      expect(await subscribers.confirm(token ?? '')).toEqual({
        brandLabel: 'Field Notes',
        brandSlug: 'field-notes',
        isListFull: true,
      });
      expect(await statusesOf(brandId)).toEqual({
        'late@example.com': 'pending',
      });

      hasSubscriberCapacity = true;
      expect(await subscribers.confirm(token ?? '')).toMatchObject({
        isListFull: false,
      });
      expect(await statusesOf(brandId)).toEqual({
        'late@example.com': 'active',
      });
    });

    it("finds one issue's send among many by its newsletter id", async () => {
      const brandId = await seedBrand();
      const sendIds = [
        await seedSend(brandId),
        await seedSend(brandId),
        await seedSend(brandId),
      ];
      const { rows } = await pool.query(
        `SELECT "newsletterId" FROM "${schema}"."newsletter_sends" WHERE "id"=$1`,
        [sendIds[0]],
      );

      const page = await sends.list(user, brandId, 1, 1, rows[0].newsletterId);

      expect({
        ids: page.docs.map((send) => send.id),
        total: page.total,
      }).toEqual({
        ids: [sendIds[0]],
        total: 1,
      });
    });

    it('fails a send that no longer fits the monthly email cap when it starts', async () => {
      const brandId = await seedBrand();
      await seedSubscriber(brandId, 'a@example.com', 'active');
      await seedSubscriber(brandId, 'b@example.com', 'active');
      await seedSubscriber(brandId, 'c@example.com', 'active');
      const sendId = await seedSend(brandId);
      remainingEmails = 2;

      await sends.processSend(sendId);

      expect(outbox).toEqual([]);
      const send = await pool.query(
        `SELECT "status","lastError" FROM "${schema}"."newsletter_sends" WHERE "id"=$1`,
        [sendId],
      );
      expect(send.rows[0]).toEqual({
        lastError: 'NEWSLETTER_SEND_LIMIT: needs 3 emails, 2 left this month',
        status: 'failed',
      });
    });

    it('sends each active subscriber exactly once and applies a bounce', async () => {
      const brandId = await seedBrand();
      await seedSubscriber(brandId, 'a@example.com', 'active');
      await seedSubscriber(brandId, 'b@example.com', 'active');
      await seedSubscriber(brandId, 'c@example.com', 'active');
      await seedSubscriber(brandId, 'gone@example.com', 'unsubscribed');
      const sendId = await seedSend(brandId);

      await sends.processSend(sendId);
      await sends.processSend(sendId);

      expect(outbox.map((email) => email.to).sort()).toEqual([
        'a@example.com',
        'b@example.com',
        'c@example.com',
      ]);
      expect(outbox[0]?.headers?.['List-Unsubscribe-Post']).toBe(
        'List-Unsubscribe=One-Click',
      );
      expect(outbox[0]?.html).toContain(
        'https://api.genfeed.test/v1/public/newsletter/c/',
      );
      expect(outbox[0]?.html).not.toContain('https://example.com/post');
      const send = await pool.query(
        `SELECT "status","recipientCount","sentCount" FROM "${schema}"."newsletter_sends" WHERE "id"=$1`,
        [sendId],
      );
      expect(send.rows[0]).toEqual({
        recipientCount: 3,
        sentCount: 3,
        status: 'completed',
      });

      const bounced = await pool.query<{ providerMessageId: string }>(
        `SELECT r."providerMessageId" FROM "${schema}"."newsletter_send_recipients" r JOIN "${schema}"."brand_subscribers" s ON s."id" = r."subscriberId" WHERE s."email"='b@example.com'`,
      );
      const providerMessageId = bounced.rows[0]?.providerMessageId ?? '';
      await pool.query(
        `INSERT INTO "${schema}"."email_provider_events" ("id","providerMessageId","eventType","occurredAt") VALUES ($1,$2,'email.bounced',now())`,
        [randomUUID(), providerMessageId],
      );
      await new NewsletterProviderEventsService(
        prisma as unknown as PrismaService,
      ).reconcile(providerMessageId);

      expect(await statusesOf(brandId)).toEqual({
        'a@example.com': 'active',
        'b@example.com': 'bounced',
        'c@example.com': 'active',
        'gone@example.com': 'unsubscribed',
      });
      const suppression = await pool.query(
        `SELECT "reason" FROM "${schema}"."email_suppressions" WHERE "recipientHash"=$1`,
        [subscriberEmailHash('b@example.com')],
      );
      expect(suppression.rows).toEqual([{ reason: 'email.bounced' }]);
    });
  },
);

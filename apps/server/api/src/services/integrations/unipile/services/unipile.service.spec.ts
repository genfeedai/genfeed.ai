import type { CredentialCryptoService } from '@api/collections/credentials/services/credential-crypto.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { UnipileService } from '@api/services/integrations/unipile/services/unipile.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IntegrationStatus } from '@genfeedai/contracts';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';

interface SentRequest {
  body?: Record<string, unknown>;
  headers: Record<string, string>;
  method: string;
  options: unknown;
  url: string;
}

const network = vi.hoisted(() => ({
  blockedHosts: new Set<string>(),
  nextResponse: { body: {} as unknown, status: 200 },
  sent: [] as SentRequest[],
}));

vi.mock('@libs/security/destination-guard', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@libs/security/destination-guard')>();
  return {
    ...actual,
    resolveSafeDestination: async (url: string) => {
      if (network.blockedHosts.has(new URL(url).hostname)) {
        throw new actual.DestinationGuardError(
          'Destination resolves to a blocked address',
        );
      }
    },
    safeFetch: async (
      url: string,
      init: {
        body?: string;
        headers?: Record<string, string>;
        method?: string;
      },
      options: unknown,
    ) => {
      network.sent.push({
        ...(init.body ? { body: JSON.parse(init.body) } : {}),
        headers: init.headers ?? {},
        method: init.method ?? 'GET',
        options,
        url,
      });
      return new Response(JSON.stringify(network.nextResponse.body), {
        headers: { 'content-type': 'application/json' },
        status: network.nextResponse.status,
      });
    },
  };
});

interface IntegrationRow {
  config: Record<string, unknown>;
  encryptedToken: string;
  id: string;
  isDeleted: boolean;
  organizationId: string;
  platform: string;
  status: string;
}

function matchesWhere(
  row: IntegrationRow,
  where: Record<string, unknown>,
): boolean {
  return Object.entries(where).every(
    ([key, value]) => row[key as keyof IntegrationRow] === value,
  );
}

describe('UnipileService', () => {
  let rows: IntegrationRow[];
  let service: UnipileService;

  function seedIntegration(
    organizationId: string,
    config: Record<string, unknown>,
  ): void {
    rows.push({
      config,
      encryptedToken: 'encrypted:secret-key',
      id: `integration_${rows.length + 1}`,
      isDeleted: false,
      organizationId,
      platform: 'UNIPILE',
      status: 'ACTIVE',
    });
  }

  beforeEach(() => {
    rows = [];
    network.blockedHosts = new Set();
    network.nextResponse = { body: {}, status: 200 };
    network.sent = [];

    const orgIntegration = {
      create: async ({
        data,
      }: {
        data: Omit<IntegrationRow, 'id' | 'isDeleted'>;
      }) => {
        const row = {
          ...data,
          id: `integration_${rows.length + 1}`,
          isDeleted: false,
        };
        rows.push(row);
        return row;
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((row) => matchesWhere(row, where)) ?? null,
      update: async ({
        data,
        where,
      }: {
        data: Partial<IntegrationRow>;
        where: Record<string, unknown>;
      }) => {
        const index = rows.findIndex((row) => matchesWhere(row, where));
        rows[index] = { ...(rows[index] as IntegrationRow), ...data };
        return rows[index];
      },
    };

    const noop = () => undefined;
    service = new UnipileService(
      { get: () => undefined } as unknown as ConfigService,
      { orgIntegration } as unknown as PrismaService,
      {
        debug: noop,
        error: noop,
        log: noop,
        warn: noop,
      } as unknown as LoggerService,
      {
        decrypt: (value: string) => value.replace(/^encrypted:/, ''),
        encrypt: (value: string) => `encrypted:${value}`,
      } as unknown as CredentialCryptoService,
    );
  });

  describe('configure', () => {
    it('stores org-scoped Unipile config with an encrypted API key', async () => {
      const result = await service.configure('org_1', {
        allowedAccountIds: ['acct_1', 'acct_1', 'acct_2'],
        apiBaseUrl: 'https://api1.unipile.com:13111///',
        apiKey: 'secret-key',
        defaultAccountId: 'acct_1',
      });

      expect(rows).toEqual([
        expect.objectContaining({
          config: {
            allowedAccountIds: ['acct_1', 'acct_2'],
            apiBaseUrl: 'https://api1.unipile.com:13111/api/v1',
            defaultAccountId: 'acct_1',
          },
          encryptedToken: 'encrypted:secret-key',
          organizationId: 'org_1',
          platform: 'UNIPILE',
          status: 'ACTIVE',
        }),
      ]);
      expect(result).toEqual({
        allowedAccountIds: ['acct_1', 'acct_2'],
        apiBaseUrl: 'https://api1.unipile.com:13111/api/v1',
        configured: true,
        defaultAccountId: 'acct_1',
        source: 'organization',
        status: IntegrationStatus.ACTIVE,
      });
    });

    it('updates the organization’s existing integration instead of adding one', async () => {
      await service.configure('org_1', {
        apiBaseUrl: 'https://api1.unipile.com:13111',
        apiKey: 'first-key',
      });
      await service.configure('org_1', {
        apiBaseUrl: 'https://api2.unipile.com:13222',
        apiKey: 'second-key',
      });

      expect(rows).toEqual([
        expect.objectContaining({
          config: expect.objectContaining({
            apiBaseUrl: 'https://api2.unipile.com:13222/api/v1',
          }),
          encryptedToken: 'encrypted:second-key',
          id: 'integration_1',
        }),
      ]);
    });

    it('normalizes a long trailing-slash run without backtracking', async () => {
      await service.configure('org_1', {
        apiBaseUrl: `https://api1.unipile.com:13111${'/'.repeat(50_000)}`,
        apiKey: 'secret-key',
      });

      expect(rows[0]?.config.apiBaseUrl).toBe(
        'https://api1.unipile.com:13111/api/v1',
      );
    });

    it('rejects a default account outside the allow-list', async () => {
      await expect(
        service.configure('org_1', {
          allowedAccountIds: ['acct_1'],
          apiBaseUrl: 'https://api1.unipile.com:13111',
          apiKey: 'secret-key',
          defaultAccountId: 'acct_9',
        }),
      ).rejects.toThrow(
        'defaultAccountId must be included in allowedAccountIds',
      );
      expect(rows).toEqual([]);
    });

    it('rejects an API base URL the destination guard refuses', async () => {
      network.blockedHosts.add('internal.example.com');

      await expect(
        service.configure('org_1', {
          apiBaseUrl: 'https://internal.example.com',
          apiKey: 'secret-key',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(rows).toEqual([]);
    });
  });

  describe('with a configured organization', () => {
    beforeEach(() => {
      seedIntegration('org_1', {
        allowedAccountIds: ['acct_1'],
        apiBaseUrl: 'https://api1.unipile.com:13111/api/v1',
      });
    });

    it('filters connected accounts to the org allow-list and redacts secrets', async () => {
      network.nextResponse = {
        body: {
          accounts: [
            {
              email: 'owner@example.com',
              id: 'acct_1',
              provider: 'GOOGLE',
              status: 'OK',
              token: 'never-return-this',
            },
            { id: 'acct_2', provider: 'LINKEDIN' },
          ],
          cursor: null,
        },
        status: 200,
      };

      const result = await service.listAccounts('org_1');

      expect(network.sent).toEqual([
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-API-KEY': 'secret-key' }),
          method: 'GET',
          options: { allowedSchemes: ['https:'] },
          url: 'https://api1.unipile.com:13111/api/v1/accounts',
        }),
      ]);
      expect(result).toEqual({
        cursor: null,
        items: [
          {
            email: 'owner@example.com',
            id: 'acct_1',
            provider: 'GOOGLE',
            status: 'OK',
          },
        ],
      });
    });

    it('sends email through the selected allowed Unipile account', async () => {
      network.nextResponse = {
        body: { id: 'email_1', status: 'queued' },
        status: 201,
      };

      const result = await service.sendEmail('org_1', {
        accountId: 'acct_1',
        body: 'Hello from Genfeed',
        subject: 'Hello',
        to: [{ displayName: 'Ada', identifier: 'ada@example.com' }],
      });

      expect(network.sent).toEqual([
        expect.objectContaining({
          body: expect.objectContaining({ account_id: 'acct_1' }),
          method: 'POST',
          url: 'https://api1.unipile.com:13111/api/v1/emails',
        }),
      ]);
      expect(result).toEqual({ id: 'email_1', status: 'queued' });
    });

    it('rejects email sends for accounts outside the org allow-list', async () => {
      await expect(
        service.sendEmail('org_1', {
          accountId: 'acct_2',
          body: 'Hello',
          subject: 'Blocked',
          to: [{ identifier: 'ada@example.com' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(network.sent).toEqual([]);
    });

    it('never uses another organization’s integration', async () => {
      await expect(service.listAccounts('org_2')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(network.sent).toEqual([]);
    });
  });
});

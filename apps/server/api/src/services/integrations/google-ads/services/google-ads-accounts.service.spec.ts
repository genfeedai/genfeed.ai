import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { GoogleAdsAccountsService } from '@api/services/integrations/google-ads/services/google-ads-accounts.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpException, HttpStatus } from '@nestjs/common';
import { isAxiosError } from 'axios';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: {
    decrypt: vi.fn((value: string) => `decrypted:${value}`),
  },
}));

interface StoredCredential {
  accessToken: string | null;
  brandId: string;
  externalId: string | null;
  externalParentId: string | null;
  id: string;
  isConnected: boolean;
  isDeleted: boolean;
  organizationId: string;
  platform: CredentialPlatform;
}

const USER = { id: 'user-1', organizationId: 'org-1', userId: 'user-1' };

function credential(overrides: Partial<StoredCredential>): StoredCredential {
  return {
    accessToken: 'encrypted-token',
    brandId: 'brand-1',
    externalId: null,
    externalParentId: null,
    id: 'cred-pending',
    isConnected: false,
    isDeleted: false,
    organizationId: 'org-1',
    platform: CredentialPlatform.GOOGLE_ADS,
    ...overrides,
  };
}

const providerError = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status },
  });

describe('GoogleAdsAccountsService', () => {
  afterEach(() => {
    vi.mocked(isAxiosError).mockReturnValue(false);
  });

  let rows: StoredCredential[];
  let customers: Array<{
    currencyCode?: string;
    descriptiveName?: string;
    id: string;
    isManager: boolean;
  }>;
  let managerClients: Record<
    string,
    Array<{ customerClient: { descriptiveName?: string; id: string } }>
  >;
  let managerFailures: Record<string, Error>;
  let service: GoogleAdsAccountsService;

  beforeEach(() => {
    vi.mocked(isAxiosError).mockImplementation(
      (value: unknown): value is never =>
        (value as { isAxiosError?: boolean } | null)?.isAxiosError === true,
    );
    rows = [credential({})];
    customers = [];
    managerClients = {};
    managerFailures = {};

    // A small in-memory store: the specs read back what it ends up holding.
    const credentialsService = {
      connectAccount: async (
        id: string,
        organizationId: string,
        account: { id: string },
        extra: Record<string, unknown>,
      ) => {
        const row = rows.find(
          (candidate) =>
            candidate.id === id && candidate.organizationId === organizationId,
        );
        if (!row) {
          throw new Error('credential missing');
        }
        Object.assign(row, extra, {
          externalId: account.id,
          isConnected: true,
        });
        return row;
      },
      findConnectedAccounts: async (
        organizationId: string,
        brandId: string,
        platform: CredentialPlatform,
      ) =>
        rows.filter(
          (row) =>
            row.organizationId === organizationId &&
            row.brandId === brandId &&
            row.platform === platform &&
            row.isConnected &&
            !row.isDeleted,
        ),
      findOne: async (filter: Partial<StoredCredential>) =>
        rows.find((row) =>
          Object.entries(filter).every(
            ([key, value]) => row[key as keyof StoredCredential] === value,
          ),
        ) ?? null,
    } as unknown as CredentialsService;

    const googleAdsService = {
      executeGaql: async (
        _accessToken: string,
        customerId: string,
      ): Promise<unknown[]> => {
        const failure = managerFailures[customerId];
        if (failure) {
          throw failure;
        }
        return managerClients[customerId] ?? [];
      },
      listAccessibleCustomers: async () => customers,
    } as unknown as GoogleAdsService;

    service = new GoogleAdsAccountsService(
      credentialsService,
      googleAdsService,
      { warn: vi.fn() } as unknown as LoggerService,
    );
  });

  describe('listSelectable', () => {
    it('lists a direct client and the clients of a manager, never the manager', async () => {
      customers = [
        {
          currencyCode: 'USD',
          descriptiveName: 'Direct',
          id: '1111111111',
          isManager: false,
        },
        { descriptiveName: 'Agency', id: '2222222222', isManager: true },
      ];
      managerClients['2222222222'] = [
        { customerClient: { descriptiveName: 'Client A', id: '3333333333' } },
      ];

      expect(await service.listSelectable('token')).toEqual([
        { currencyCode: 'USD', id: '1111111111', name: 'Direct' },
        {
          currencyCode: undefined,
          id: '3333333333',
          managerId: '2222222222',
          managerName: 'Agency',
          name: 'Client A',
        },
      ]);
    });

    it('lists a client reachable both ways once, as a direct account', async () => {
      customers = [
        { descriptiveName: 'Direct', id: '1111111111', isManager: false },
        { descriptiveName: 'Agency', id: '2222222222', isManager: true },
      ];
      managerClients['2222222222'] = [
        { customerClient: { descriptiveName: 'Direct', id: '1111111111' } },
      ];

      const result = await service.listSelectable('token');

      expect(result.map((account) => account.id)).toEqual(['1111111111']);
      expect(result[0]?.managerId).toBeUndefined();
    });

    it('returns nothing for a manager with no clients', async () => {
      customers = [
        { descriptiveName: 'Genfeed.ai', id: '2207671117', isManager: true },
      ];
      managerClients['2207671117'] = [];

      expect(await service.listSelectable('token')).toEqual([]);
    });

    it('keeps the direct accounts when Google refuses to show a manager', async () => {
      customers = [
        { descriptiveName: 'Direct', id: '1111111111', isManager: false },
        { descriptiveName: 'Agency', id: '2222222222', isManager: true },
      ];
      managerFailures['2222222222'] = providerError(403);

      const result = await service.listSelectable('token');

      expect(result.map((account) => account.id)).toEqual(['1111111111']);
    });

    it('fails instead of returning a partial list when Google is unavailable', async () => {
      customers = [
        { descriptiveName: 'Direct', id: '1111111111', isManager: false },
        { descriptiveName: 'Agency', id: '2222222222', isManager: true },
      ];
      managerFailures['2222222222'] = providerError(503);

      await expect(service.listSelectable('token')).rejects.toThrow(
        'status code 503',
      );
    });
  });

  describe('listForPending', () => {
    beforeEach(() => {
      customers = [
        { descriptiveName: 'First', id: '111-111-1111', isManager: false },
        { descriptiveName: 'Second', id: '222-222-2222', isManager: false },
      ];
    });

    it('flags an account another live credential of the brand already holds', async () => {
      rows.push(
        credential({
          externalId: '222-222-2222',
          id: 'cred-live',
          isConnected: true,
        }),
      );

      expect(
        await service.listForPending(USER as never, 'cred-pending'),
      ).toEqual([
        {
          currencyCode: undefined,
          id: '111-111-1111',
          isAlreadyConnected: false,
          name: 'First',
        },
        {
          currencyCode: undefined,
          id: '222-222-2222',
          isAlreadyConnected: true,
          name: 'Second',
        },
      ]);
      expect(EncryptionUtil.decrypt).toHaveBeenCalledWith('encrypted-token');
    });

    it('hides a credential of a brand the caller may not reach', async () => {
      const restricted = { ...USER, allowedBrandIds: ['brand-other'] };

      await expect(
        service.listForPending(restricted as never, 'cred-pending'),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('lists for a caller whose brand list includes the credential brand', async () => {
      const restricted = { ...USER, allowedBrandIds: ['brand-1'] };

      expect(
        await service.listForPending(restricted as never, 'cred-pending'),
      ).toHaveLength(2);
    });

    it("never reads another organization's credential", async () => {
      rows = [credential({ organizationId: 'org-2' })];

      await expect(
        service.listForPending(USER as never, 'cred-pending'),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });
  });

  describe('selectForPending', () => {
    beforeEach(() => {
      customers = [
        { descriptiveName: 'First', id: '111-111-1111', isManager: false },
        { descriptiveName: 'Agency', id: '220-767-1117', isManager: true },
      ];
      managerClients['220-767-1117'] = [
        {
          customerClient: { descriptiveName: 'Client', id: '318-402-9951' },
        },
      ];
    });

    it('connects the chosen account and keeps its manager as the parent', async () => {
      await service.selectForPending(
        USER as never,
        'cred-pending',
        '3184029951',
      );

      expect(rows[0]).toMatchObject({
        externalId: '318-402-9951',
        externalParentId: '220-767-1117',
        isConnected: true,
      });
    });

    it('connects a direct account with no manager parent', async () => {
      await service.selectForPending(
        USER as never,
        'cred-pending',
        '111-111-1111',
      );

      expect(rows[0]).toMatchObject({
        externalId: '111-111-1111',
        externalParentId: null,
        isConnected: true,
      });
    });

    it('rejects an account this login does not reach, leaving the credential pending', async () => {
      await expect(
        service.selectForPending(USER as never, 'cred-pending', '999-999-9999'),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });

      expect(rows[0]).toMatchObject({ externalId: null, isConnected: false });
    });

    it('refuses to repoint a credential that is already connected', async () => {
      rows = [
        credential({
          externalId: '111-111-1111',
          isConnected: true,
        }),
      ];

      await expect(
        service.selectForPending(USER as never, 'cred-pending', '318-402-9951'),
      ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });

      expect(rows[0]?.externalId).toBe('111-111-1111');
    });

    it('returns the connected credential when the same selection is repeated', async () => {
      await service.selectForPending(
        USER as never,
        'cred-pending',
        '111-111-1111',
      );

      const repeated = await service.selectForPending(
        USER as never,
        'cred-pending',
        '1111111111',
      );

      expect(repeated).toMatchObject({
        externalId: '111-111-1111',
        isConnected: true,
      });
    });

    it('refuses a credential that holds no token', async () => {
      rows = [credential({ accessToken: null })];

      await expect(
        service.selectForPending(USER as never, 'cred-pending', '111-111-1111'),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe('toVerifyException', () => {
    it.each([
      [400, HttpStatus.BAD_REQUEST],
      [401, HttpStatus.BAD_REQUEST],
      [403, HttpStatus.BAD_REQUEST],
      [503, HttpStatus.BAD_GATEWAY],
    ])('maps a %i provider failure to %i', (providerStatus, expected) => {
      const error = Object.assign(new Error('provider'), {
        isAxiosError: true,
        response: { status: providerStatus },
      });

      expect(service.toVerifyException(error, 'Lookup').getStatus()).toBe(
        expected,
      );
    });

    it('passes an HttpException through unchanged', () => {
      const original = new HttpException('x', HttpStatus.FORBIDDEN);

      expect(service.toVerifyException(original, 'Lookup')).toBe(original);
    });
  });
});

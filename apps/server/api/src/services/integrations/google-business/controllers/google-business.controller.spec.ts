import { TENANT_READ_POLICY } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { GoogleBusinessController } from '@api/services/integrations/google-business/controllers/google-business.controller';
import { GoogleBusinessApiError } from '@api/services/integrations/google-business/google-business-error.util';
import type { GoogleBusinessLocation } from '@api/services/integrations/google-business/interfaces/google-business.interface';

vi.mock('@libs/utils/encryption/encryption.util', () => ({
  EncryptionUtil: { decrypt: (value: string) => `plain:${value}` },
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: (
    _request: unknown,
    _serializer: unknown,
    data: { docs: unknown[] },
  ) => data.docs,
  serializeSingle: (_request: unknown, _serializer: unknown, data: unknown) =>
    data,
}));

const GRANTED = 'https://www.googleapis.com/auth/business.manage';
const CAFE: GoogleBusinessLocation = {
  id: 'accounts/1/locations/10',
  title: 'Corner Cafe',
};
const BAKERY: GoogleBusinessLocation = {
  id: 'accounts/1/locations/20',
  title: 'Harbour Bakery',
};

describe('GoogleBusinessController', () => {
  let locations: GoogleBusinessLocation[];
  let listFailure: unknown;
  let tokens: { accessToken: string; refreshToken?: string; scope?: string };
  let patched: Array<Record<string, unknown>>;
  let connected: Array<{ id: string; profile: Record<string, unknown> }>;
  let pending: Record<string, unknown> | null;
  let controller: GoogleBusinessController;
  const user = { id: 'user-1', organizationId: 'org-1' } as never;
  const request = {} as never;

  beforeEach(() => {
    locations = [CAFE];
    listFailure = null;
    tokens = { accessToken: 'a', refreshToken: 'r', scope: GRANTED };
    patched = [];
    connected = [];
    pending = {
      brandId: 'brand-1',
      id: 'cred-1',
      isConnected: false,
      organizationId: 'org-1',
      userId: 'user-1',
    };

    controller = new GoogleBusinessController(
      {
        exchangeCodeForTokens: async () => tokens,
        listLocations: async () => {
          if (listFailure) throw listFailure;
          return locations;
        },
      } as never,
      { error: () => {}, log: () => {}, warn: () => {} } as never,
      {} as never,
      {
        connectAccount: async (
          id: string,
          _org: string,
          profile: Record<string, unknown>,
        ) => {
          connected.push({ id, profile });
          return { id, isConnected: true, externalId: profile.id };
        },
        createPendingForBrand: async () => ({
          id: `sibling-${connected.length}`,
        }),
        findOne: async () => pending,
        findPendingOAuthCredential: async () => pending,
        patch: async (id: string, update: Record<string, unknown>) => {
          patched.push(update);
          return { ...pending, ...update, id };
        },
      } as never,
    );
  });

  const verify = () =>
    controller.verify(request, { code: 'code', state: 'state' });

  it('connects the only location at once', async () => {
    const result = (await verify()) as unknown as {
      externalId?: string;
      isConnected: boolean;
    };

    expect(result).toMatchObject({ externalId: CAFE.id, isConnected: true });
    expect(connected).toEqual([
      { id: 'cred-1', profile: { id: CAFE.id, name: 'Corner Cafe' } },
    ]);
  });

  it('leaves the connection waiting for a choice when the account has several locations', async () => {
    locations = [CAFE, BAKERY];

    const result = (await verify()) as unknown as {
      externalId?: string;
      isConnected: boolean;
    };

    expect(result.isConnected).toBe(false);
    expect(result.externalId).toBeUndefined();
    expect(connected).toEqual([]);
    expect(patched[0]).toMatchObject({ isConnected: false, refreshToken: 'r' });
  });

  it('refuses a grant that left out the business scope', async () => {
    tokens = { accessToken: 'a', refreshToken: 'r', scope: 'openid' };

    await expect(verify()).rejects.toThrow('access was not granted');
    expect(patched).toEqual([]);
  });

  it('refuses a grant with no refresh token', async () => {
    tokens = { accessToken: 'a', scope: GRANTED };

    await expect(verify()).rejects.toThrow('refresh token');
  });

  it('refuses an account that manages no location', async () => {
    locations = [];

    await expect(verify()).rejects.toThrow('manages no business locations');
  });

  it('says Business Profile access is not approved when Google refuses the listing', async () => {
    listFailure = new GoogleBusinessApiError(
      'forbidden',
      403,
      'PERMISSION_DENIED',
    );

    await expect(verify()).rejects.toMatchObject({ status: 503 });
  });

  it('reads the location list only inside the callers own organization', () => {
    expect(
      Reflect.getMetadata(
        TENANT_READ_POLICY,
        GoogleBusinessController.prototype.listLocations,
      ),
    ).toBe('owner');
  });

  describe('selecting locations', () => {
    it('settles the first choice on the credential and the rest on their own credentials', async () => {
      locations = [CAFE, BAKERY];
      pending = { ...pending, accessToken: 'enc', refreshToken: 'enc-r' };

      const result = (await controller.selectLocations(
        request,
        user,
        'cred-1',
        {
          locationIds: [CAFE.id, BAKERY.id],
        },
      )) as unknown as Array<{ id: string }>;

      expect(result.map((credential) => credential.id)).toEqual([
        'cred-1',
        'sibling-1',
      ]);
      expect(connected.map(({ profile }) => profile.id)).toEqual([
        CAFE.id,
        BAKERY.id,
      ]);
    });

    it('refuses a location the Google account does not manage', async () => {
      pending = { ...pending, accessToken: 'enc' };

      await expect(
        controller.selectLocations(request, user, 'cred-1', {
          locationIds: ['accounts/9/locations/99'],
        }),
      ).rejects.toThrow('not available to this Google account');
      expect(connected).toEqual([]);
    });

    it('refuses to repoint a credential that already has a location', async () => {
      pending = {
        ...pending,
        accessToken: 'enc',
        externalId: CAFE.id,
        isConnected: true,
      };

      await expect(
        controller.selectLocations(request, user, 'cred-1', {
          locationIds: [BAKERY.id],
        }),
      ).rejects.toThrow('already connected');
    });
  });
});

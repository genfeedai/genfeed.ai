import { AuthCliController } from '@api/auth/controllers/auth-cli.controller';
import type { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import type { User } from '@clerk/backend';

const userId = '507f191e810c19729de860ee'.toString();
const orgId = '507f191e810c19729de860ee'.toString();

const makeUser = (overrides: Record<string, unknown> = {}): User =>
  ({
    id: 'clerk-user-1',
    publicMetadata: {
      isSuperAdmin: false,
      organization: orgId,
      user: userId,
      ...overrides,
    },
  }) as unknown as User;

const mockApiKeysService = {
  createWithKey: vi.fn(),
  findAll: vi.fn().mockResolvedValue({ docs: [] }),
  revoke: vi.fn(),
} as unknown as ApiKeysService;

const makeRequest = (overrides: Record<string, unknown> = {}) =>
  ({
    context: {},
    ...overrides,
  }) as never;

function buildController() {
  return new AuthCliController(mockApiKeysService);
}

describe('AuthCliController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockApiKeysService.findAll).mockResolvedValue({
      docs: [],
    } as never);
  });

  it('should be defined', () => {
    expect(buildController()).toBeDefined();
  });

  describe('createCliToken', () => {
    it('exposes the token exchange handler', () => {
      const controller = buildController();

      expect(controller.createCliToken).toBeTypeOf('function');
    });

    it('should create CLI API key for standard user', async () => {
      const controller = buildController();
      vi.mocked(mockApiKeysService.createWithKey).mockResolvedValue({
        plainKey: 'gf_test_key_123',
      } as never);

      const result = await controller.createCliToken(makeUser(), makeRequest());

      expect(result).toEqual({ key: 'gf_test_key_123' });
      expect(mockApiKeysService.createWithKey).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'genfeedai',
          description: 'Auto-generated key for gf CLI',
          label: 'CLI',
        }),
      );
    });

    it('should scope CLI key revocation to the active organization', async () => {
      const controller = buildController();
      vi.mocked(mockApiKeysService.createWithKey).mockResolvedValue({
        plainKey: 'gf_test_key_123',
      } as never);

      await controller.createCliToken(makeUser(), makeRequest());

      const pipeline = vi.mocked(mockApiKeysService.findAll).mock.calls[0][0] as
        | Array<{ $match?: Record<string, unknown> }>
        | undefined;

      expect(pipeline?.[0]?.$match?.organization).toBeDefined();
      expect((pipeline?.[0]?.$match?.organization as string).toString()).toBe(
        orgId,
      );
    });

    it('should include admin scope for superAdmin users', async () => {
      const controller = buildController();
      vi.mocked(mockApiKeysService.createWithKey).mockResolvedValue({
        plainKey: 'gf_admin_key',
      } as never);

      await controller.createCliToken(
        makeUser({ isSuperAdmin: true }),
        makeRequest(),
      );

      const callArgs = vi.mocked(mockApiKeysService.createWithKey).mock
        .calls[0][0] as { scopes: string[] };
      expect(callArgs.scopes).toContain('admin');
      expect(callArgs.scopes).toContain('credits:provision');
    });

    it('should NOT include admin scope for standard users', async () => {
      const controller = buildController();
      vi.mocked(mockApiKeysService.createWithKey).mockResolvedValue({
        plainKey: 'gf_std_key',
      } as never);

      await controller.createCliToken(
        makeUser({ isSuperAdmin: false }),
        makeRequest(),
      );

      const callArgs = vi.mocked(mockApiKeysService.createWithKey).mock
        .calls[0][0] as { scopes: string[] };
      expect(callArgs.scopes).not.toContain('admin');
    });

    it('should revoke existing CLI keys before creating new one', async () => {
      const controller = buildController();
      const existingKey = { _id: '507f191e810c19729de860ee' };
      vi.mocked(mockApiKeysService.findAll).mockResolvedValue({
        docs: [existingKey],
      } as never);
      vi.mocked(mockApiKeysService.createWithKey).mockResolvedValue({
        plainKey: 'gf_new_key',
      } as never);

      await controller.createCliToken(makeUser(), makeRequest());

      expect(mockApiKeysService.revoke).toHaveBeenCalledWith(
        existingKey._id.toString(),
      );
      expect(mockApiKeysService.createWithKey).toHaveBeenCalled();
    });

    it('should propagate errors from createWithKey', async () => {
      const controller = buildController();
      vi.mocked(mockApiKeysService.createWithKey).mockRejectedValue(
        new Error('Key generation failed'),
      );

      await expect(
        controller.createCliToken(makeUser(), makeRequest()),
      ).rejects.toThrow('Key generation failed');
    });
  });
});

import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(),
}));

vi.mock('passport-custom', () => ({
  Strategy: class Strategy {
    success(_user: unknown) {
      /* noop */
    }
    error(_err: unknown) {
      /* noop */
    }
  },
}));

vi.mock('@libs/logger/logger.service', () => ({
  LoggerService: vi.fn().mockImplementation(() => ({
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: { getCallerName: vi.fn().mockReturnValue('test-caller') },
}));

vi.mock('@api/config/config.service', () => ({
  ConfigService: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockReturnValue('test-secret-key'),
  })),
}));

vi.mock('@genfeedai/config', () => ({
  IS_LOCAL_MODE: false,
}));

import { ClerkStrategy } from '@api/auth/passport/clerk.strategy';
import { verifyToken } from '@clerk/backend';

function createClerkStrategy() {
  const mockClerkService = {
    getUser: vi
      .fn()
      .mockResolvedValue({ id: 'user_123', username: 'testuser' }),
  };
  const mockConfigService = { get: vi.fn().mockReturnValue('test-secret-key') };
  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };
  const mockAuthIdentityResolverService = {
    resolve: vi.fn().mockResolvedValue({
      brandId: 'brand_current',
      clerkUserId: 'user_123',
      organizationId: 'org_current',
      resolvedBy: 'metadata',
      userId: 'user_current',
    }),
  };

  const strategy = new ClerkStrategy(
    mockConfigService as never,
    mockClerkService as never,
    mockLoggerService as never,
    mockAuthIdentityResolverService as never,
  );

  return {
    mockAuthIdentityResolverService,
    mockClerkService,
    mockConfigService,
    mockLoggerService,
    strategy,
  };
}

const verifyTokenMock = verifyToken as unknown as {
  mockRejectedValue: (value: unknown) => void;
  mockResolvedValue: (value: unknown) => void;
};

describe('ClerkStrategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    const { strategy } = createClerkStrategy();
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('throws UnauthorizedException when no token provided', async () => {
      const { strategy } = createClerkStrategy();
      const req = { headers: {} };
      await expect(strategy.validate(req as never)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException with "No token provided" for missing auth header', async () => {
      const { strategy } = createClerkStrategy();
      const req = { headers: {} };
      await expect(strategy.validate(req as never)).rejects.toMatchObject({
        message: 'No token provided',
      });
    });

    it('throws UnauthorizedException for invalid JWT format (not 3 parts)', async () => {
      const { strategy } = createClerkStrategy();
      const req = { headers: { authorization: 'Bearer notavalidjwt' } };
      await expect(strategy.validate(req as never)).rejects.toMatchObject({
        message: 'Invalid token format',
      });
    });

    it('throws UnauthorizedException for empty token parts in JWT', async () => {
      const { strategy } = createClerkStrategy();
      const req = { headers: { authorization: 'Bearer ..' } };
      await expect(strategy.validate(req as never)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('validates and returns user for valid JWT token', async () => {
      const { strategy, mockClerkService, mockAuthIdentityResolverService } =
        createClerkStrategy();
      const mockUser = { id: 'user_123', username: 'testuser' };
      verifyTokenMock.mockResolvedValue({
        metadata: {
          publicMetadata: {
            organization: 'org_123',
          },
        },
        sub: 'user_123',
      } as never);
      mockClerkService.getUser.mockResolvedValue(mockUser);

      const req = {
        headers: {
          authorization: 'Bearer header.payload.signature',
        },
      };

      const result = await strategy.validate(req as never);
      expect(result).toMatchObject(mockUser);
      expect(mockAuthIdentityResolverService.resolve).toHaveBeenCalledWith(
        mockUser,
      );
      expect(
        (
          result as {
            publicMetadata?: {
              brand?: string;
              organization?: string;
              user?: string;
            };
          }
        ).publicMetadata,
      ).toMatchObject({
        brand: 'brand_current',
        organization: 'org_current',
        user: 'user_current',
      });
    });

    it('returns a synthetic Clerk user from verified hot-path claims without fetching Clerk user details', async () => {
      const { strategy, mockClerkService, mockAuthIdentityResolverService } =
        createClerkStrategy();

      verifyTokenMock.mockResolvedValue({
        email: 'owner@example.com',
        metadata: {
          publicMetadata: {
            brand: 'brand_123',
            isSuperAdmin: true,
            organization: 'org_123',
            user: '507f1f77bcf86cd799439011',
          },
        },
        sub: 'user_123',
      } as never);

      const req = {
        headers: {
          authorization: 'Bearer header.payload.signature',
        },
      };

      const result = await strategy.validate(req as never);

      expect(result).toMatchObject({
        email: 'owner@example.com',
        emailAddresses: [{ emailAddress: 'owner@example.com' }],
        id: 'user_123',
        publicMetadata: {
          brand: 'brand_current',
          clerkId: 'user_123',
          isSuperAdmin: true,
          organization: 'org_current',
          user: 'user_current',
        },
      });
      expect(mockClerkService.getUser).not.toHaveBeenCalled();
      expect(mockAuthIdentityResolverService.resolve).toHaveBeenCalledOnce();
    });

    it('falls back to Clerk user fetch and repair when verified claims are incomplete', async () => {
      const { strategy, mockClerkService, mockAuthIdentityResolverService } =
        createClerkStrategy();
      const mockUser = { id: 'user_123', username: 'testuser' };

      verifyTokenMock.mockResolvedValue({
        metadata: {
          publicMetadata: {
            organization: 'org_123',
          },
        },
        sub: 'user_123',
      } as never);
      mockClerkService.getUser.mockResolvedValue(mockUser);

      const req = {
        headers: {
          authorization: 'Bearer header.payload.signature',
        },
      };

      const result = await strategy.validate(req as never);

      expect(mockClerkService.getUser).toHaveBeenCalledWith('user_123');
      expect(mockAuthIdentityResolverService.resolve).toHaveBeenCalledWith(
        mockUser,
      );
      expect(
        (
          result as {
            publicMetadata?: {
              brand?: string;
              clerkId?: string;
              organization?: string;
              user?: string;
            };
          }
        ).publicMetadata,
      ).toEqual({
        brand: 'brand_current',
        clerkId: 'user_123',
        organization: 'org_current',
        user: 'user_current',
      });
    });

    it('throws UnauthorizedException for expired token', async () => {
      const { strategy } = createClerkStrategy();
      verifyTokenMock.mockRejectedValue({
        message: 'JWT is expired',
        reason: 'token-expired',
      });

      const req = {
        headers: {
          authorization: 'Bearer header.payload.signature',
        },
      };

      await expect(strategy.validate(req as never)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws ServiceUnavailableException when Clerk is rate limited', async () => {
      const { strategy, mockClerkService } = createClerkStrategy();
      mockClerkService.getUser.mockRejectedValue({
        message: 'Too Many Requests',
        name: 'ClerkAPIResponseError',
        status: 429,
      });
      verifyTokenMock.mockResolvedValue({
        sub: 'user_123',
      } as never);

      const req = {
        headers: {
          authorization: 'Bearer header.payload.signature',
        },
      };

      await expect(strategy.validate(req as never)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('throws UnauthorizedException for invalid token', async () => {
      const { strategy } = createClerkStrategy();
      verifyTokenMock.mockRejectedValue(new Error('Invalid signature'));

      const req = {
        headers: {
          authorization: 'Bearer header.payload.signature',
        },
      };

      await expect(strategy.validate(req as never)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('logs error for non-expired, non-format token errors', async () => {
      const { strategy, mockLoggerService } = createClerkStrategy();
      const error = new Error('Some other error');
      verifyTokenMock.mockRejectedValue(error);

      const req = {
        headers: {
          authorization: 'Bearer header.payload.signature',
        },
      };

      await expect(strategy.validate(req as never)).rejects.toThrow(
        UnauthorizedException,
      );

      expect(mockLoggerService.error).toHaveBeenCalled();
    });
  });
});

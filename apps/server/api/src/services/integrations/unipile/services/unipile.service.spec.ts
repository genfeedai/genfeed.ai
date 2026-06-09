import { ConfigService } from '@api/config/config.service';
import { UnipileService } from '@api/services/integrations/unipile/services/unipile.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

describe('UnipileService', () => {
  let service: UnipileService;

  const mockOrgIntegration = {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  };

  const mockPrisma = {
    orgIntegration: mockOrgIntegration,
  };

  const mockHttpService = {
    get: vi.fn(),
    post: vi.fn(),
  };

  const mockConfigService = {
    get: vi.fn(),
  };

  const mockCryptoService = {
    decrypt: vi.fn((value: string) => value.replace(/^encrypted:/, '')),
    encrypt: vi.fn((value: string) => `encrypted:${value}`),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnipileService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: 'CryptoService', useValue: mockCryptoService },
      ],
    }).compile();

    service = module.get<UnipileService>(UnipileService);
  });

  it('stores org-scoped Unipile config with an encrypted API key', async () => {
    mockOrgIntegration.findFirst.mockResolvedValue(null);
    mockOrgIntegration.create.mockResolvedValue({
      id: 'integration_1',
      status: 'ACTIVE',
    });

    const result = await service.configure('org_1', {
      allowedAccountIds: ['acct_1', 'acct_1', 'acct_2'],
      apiBaseUrl: 'https://api1.unipile.com:13111',
      apiKey: 'secret-key',
      defaultAccountId: 'acct_1',
    });

    expect(mockOrgIntegration.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
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
    });
    expect(result).toEqual({
      allowedAccountIds: ['acct_1', 'acct_2'],
      apiBaseUrl: 'https://api1.unipile.com:13111/api/v1',
      configured: true,
      defaultAccountId: 'acct_1',
      source: 'organization',
      status: 'active',
    });
  });

  it('filters connected accounts to the org allow-list and redacts secrets', async () => {
    mockOrgIntegration.findFirst.mockResolvedValue({
      config: {
        allowedAccountIds: ['acct_1'],
        apiBaseUrl: 'https://api1.unipile.com:13111/api/v1',
      },
      encryptedToken: 'encrypted:secret-key',
      status: 'ACTIVE',
    });
    mockHttpService.get.mockReturnValue(
      of({
        data: {
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
      }),
    );

    const result = await service.listAccounts('org_1');

    expect(mockHttpService.get).toHaveBeenCalledWith(
      'https://api1.unipile.com:13111/api/v1/accounts',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-KEY': 'secret-key' }),
      }),
    );
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
    mockOrgIntegration.findFirst.mockResolvedValue({
      config: {
        allowedAccountIds: ['acct_1'],
        apiBaseUrl: 'https://api1.unipile.com:13111/api/v1',
      },
      encryptedToken: 'encrypted:secret-key',
      status: 'ACTIVE',
    });
    mockHttpService.post.mockReturnValue(
      of({ data: { id: 'email_1', status: 'queued' }, status: 201 }),
    );

    const result = await service.sendEmail('org_1', {
      accountId: 'acct_1',
      body: 'Hello from Genfeed',
      subject: 'Hello',
      to: [{ displayName: 'Ada', identifier: 'ada@example.com' }],
    });

    expect(mockHttpService.post).toHaveBeenCalledWith(
      'https://api1.unipile.com:13111/api/v1/emails',
      expect.stringContaining('"account_id":"acct_1"'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-KEY': 'secret-key' }),
      }),
    );
    expect(result).toEqual({ id: 'email_1', status: 'queued' });
  });

  it('rejects email sends for accounts outside the org allow-list', async () => {
    mockOrgIntegration.findFirst.mockResolvedValue({
      config: {
        allowedAccountIds: ['acct_1'],
        apiBaseUrl: 'https://api1.unipile.com:13111/api/v1',
      },
      encryptedToken: 'encrypted:secret-key',
      status: 'ACTIVE',
    });

    await expect(
      service.sendEmail('org_1', {
        accountId: 'acct_2',
        body: 'Hello',
        subject: 'Blocked',
        to: [{ identifier: 'ada@example.com' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockHttpService.post).not.toHaveBeenCalled();
  });
});

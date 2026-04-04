import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { IntegrationsService } from '@api/endpoints/integrations/integrations.service';
import { OrgIntegration } from '@api/endpoints/integrations/schemas/org-integration.schema';
import { REDIS_EVENTS } from '@genfeedai/integrations';
import { IntegrationPlatform } from '@genfeedai/enums';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getModelToken } from '@nestjs/mongoose';
import { Test, type TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';

const mockSave = vi.fn();

const makeDoc = (overrides: Record<string, unknown> = {}) => {
  const doc = {
    _id: new Types.ObjectId(),
    config: {},
    encryptedToken: 'enc-token',
    isDeleted: false,
    organization: new Types.ObjectId(),
    platform: IntegrationPlatform.DISCORD,
    save: mockSave,
    status: 'active',
    toObject: function () {
      return { ...this };
    },
    ...overrides,
  };
  return doc;
};

describe('IntegrationsService', () => {
  let service: IntegrationsService;
  let integrationModel: {
    findOne: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    new: ReturnType<typeof vi.fn>;
  } & (new (
    ...args: unknown[]
  ) => unknown);
  let eventEmitter: { emit: ReturnType<typeof vi.fn> };
  let cryptoService: {
    encrypt: ReturnType<typeof vi.fn>;
    decrypt: ReturnType<typeof vi.fn>;
  };
  let redisService: { publish: ReturnType<typeof vi.fn> };

  const orgId = new Types.ObjectId().toString();

  beforeEach(async () => {
    mockSave.mockReset();
    eventEmitter = { emit: vi.fn() };
    cryptoService = {
      decrypt: vi.fn((t: string) => `dec:${t}`),
      encrypt: vi.fn().mockResolvedValue('encrypted-tok'),
    };
    redisService = { publish: vi.fn().mockResolvedValue(undefined) };

    const ModelMock = vi.fn().mockImplementation(function (data: unknown) {
      const doc = makeDoc(data as Record<string, unknown>);
      doc.save = mockSave.mockResolvedValue({
        ...doc,
        toObject: () => ({ ...doc }),
      });
      return doc;
    });
    ModelMock.findOne = vi.fn();
    ModelMock.find = vi.fn();

    integrationModel = ModelMock as typeof integrationModel;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationsService,
        {
          provide: getModelToken(OrgIntegration.name, DB_CONNECTIONS.CLOUD),
          useValue: integrationModel,
        },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: 'CryptoService', useValue: cryptoService },
        { provide: 'RedisService', useValue: redisService },
      ],
    }).compile();

    service = module.get<IntegrationsService>(IntegrationsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ──────────────────────────── create ─────────────────────────────────

  describe('create', () => {
    it('throws BadRequestException when integration already exists', async () => {
      (integrationModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: vi.fn().mockResolvedValue(makeDoc()),
      });
      // findOne without .exec (direct call in create method)
      integrationModel.findOne = vi.fn().mockResolvedValue(makeDoc());

      await expect(
        service.create(orgId, {
          botToken: 'tok',
          platform: IntegrationPlatform.DISCORD,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('encrypts bot token before saving', async () => {
      (integrationModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      await service.create(orgId, {
        botToken: 'raw-token',
        platform: IntegrationPlatform.DISCORD,
      });

      expect(cryptoService.encrypt).toHaveBeenCalledWith('raw-token');
    });

    it('emits integration created event', async () => {
      (integrationModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );
      await service.create(orgId, {
        botToken: 'tok',
        platform: IntegrationPlatform.DISCORD,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        REDIS_EVENTS.INTEGRATION_CREATED,
        expect.objectContaining({ orgId }),
      );
    });
  });

  // ──────────────────────────── findAll ────────────────────────────────

  describe('findAll', () => {
    it('returns integrations with masked token', async () => {
      const doc = makeDoc();
      (integrationModel.find as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: vi.fn().mockResolvedValue([doc]),
      });

      const result = await service.findAll(orgId);
      expect(result[0].encryptedToken).toBe('***MASKED***');
    });

    it('queries by organization and isDeleted: false', async () => {
      (integrationModel.find as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: vi.fn().mockResolvedValue([]),
      });
      await service.findAll(orgId);
      expect(integrationModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: false }),
      );
    });
  });

  // ──────────────────────────── findOne ────────────────────────────────

  describe('findOne', () => {
    it('throws NotFoundException when integration not found', async () => {
      (integrationModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });
      await expect(
        service.findOne(orgId, new Types.ObjectId().toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns masked token', async () => {
      const doc = makeDoc();
      (integrationModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        exec: vi.fn().mockResolvedValue(doc),
      });
      const result = await service.findOne(orgId, doc._id.toString());
      expect(result.encryptedToken).toBe('***MASKED***');
    });
  });

  // ──────────────────────────── remove ─────────────────────────────────

  describe('remove', () => {
    it('throws NotFoundException when integration not found', async () => {
      (integrationModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );
      await expect(
        service.remove(orgId, new Types.ObjectId().toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('sets isDeleted to true and saves', async () => {
      const doc = makeDoc();
      mockSave.mockResolvedValue(doc);
      (integrationModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        doc,
      );

      await service.remove(orgId, doc._id.toString());
      expect(doc.isDeleted).toBe(true);
      expect(mockSave).toHaveBeenCalled();
    });

    it('emits integration deleted event', async () => {
      const doc = makeDoc();
      mockSave.mockResolvedValue(doc);
      (integrationModel.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(
        doc,
      );

      await service.remove(orgId, doc._id.toString());
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        REDIS_EVENTS.INTEGRATION_DELETED,
        expect.objectContaining({ orgId }),
      );
    });
  });
});

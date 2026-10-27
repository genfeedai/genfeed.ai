import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import { AgentMemoryCaptureService } from '@api/collections/agent-memories/services/agent-memory-capture.service';
import { AgentMemoryRevisionsService } from '@api/collections/agent-memories/services/agent-memory-revisions.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ErrorResponse } from '@api/helpers/utils/error-response/error-response.util';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { AgentMemoriesController } from './agent-memories.controller';

vi.mock('@api/helpers/utils/error-response/error-response.util', () => ({
  ErrorResponse: {
    handle: vi.fn((error, _logger, ctx) => ({
      ctx,
      error: String(error),
    })),
  },
}));

const ORG_ID = 'org-111';
const USER_ID = 'user-222';
const mockUser = {
  brandId: 'brand-333',
  id: 'auth-provider-222',
  organizationId: ORG_ID,
  userId: USER_ID,
} as User;
const mockRequest = {} as Request;

describe('AgentMemoriesController', () => {
  let controller: AgentMemoriesController;
  let memoriesService: vi.Mocked<AgentMemoriesService>;
  let memoryCaptureService: vi.Mocked<AgentMemoryCaptureService>;
  let revisionsService: vi.Mocked<AgentMemoryRevisionsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentMemoriesController],
      providers: [
        {
          provide: AgentMemoriesService,
          useValue: {
            archiveMemory: vi.fn(),
            archivePersonalMemory: vi.fn(),
            listForBrand: vi.fn(),
            listForOrganization: vi.fn(),
            listForUser: vi.fn(),
            listPersonalForUser: vi.fn(),
            promoteMemory: vi.fn(),
            rejectMemoryPromotion: vi.fn(),
            removeMemory: vi.fn(),
          },
        },
        {
          provide: AgentMemoryCaptureService,
          useValue: {
            capture: vi.fn(),
          },
        },
        {
          provide: AgentMemoryRevisionsService,
          useValue: { correct: vi.fn(), get: vi.fn(), list: vi.fn() },
        },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AgentMemoriesController);
    memoriesService = module.get(AgentMemoriesService);
    memoryCaptureService = module.get(AgentMemoryCaptureService);
    revisionsService = module.get(AgentMemoryRevisionsService);
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('memory revisions', () => {
    const serializingRequest = {
      originalUrl: '/v1/agent/memories/memory-1/revisions',
    } as Request;
    const view = {
      actorUserId: USER_ID,
      confidence: 0.5,
      content: 'Corrected',
      createdAt: new Date('2026-10-27T07:00:00Z'),
      id: 'revision-2',
      importance: 0.5,
      isCurrent: true,
      kind: 'correction',
      memoryId: 'memory-1',
      provenance: {},
      reason: 'It changed',
      revision: 2,
      summary: null,
      tags: [],
    };

    it('corrects a memory as the authenticated user, never from the body', async () => {
      revisionsService.correct.mockResolvedValue({
        isReplay: false,
        memory: {} as never,
        revision: view as never,
      });
      const body = {
        content: 'Corrected',
        expectedRevisionId: 'revision-1',
        reason: 'It changed',
        requestId: '6f1c5b0e-6a6f-4a3b-9a5e-0d2f6c1d9a11',
      };

      const result = await controller.correct(
        serializingRequest,
        'memory-1',
        body,
        mockUser,
      );

      expect(revisionsService.correct).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: ORG_ID, userId: USER_ID }),
        'memory-1',
        body,
      );
      expect(result).toMatchObject({
        data: { attributes: { content: 'Corrected', isCurrent: true } },
      });
    });

    it('lists revisions with the next cursor in the response meta', async () => {
      revisionsService.list.mockResolvedValue({
        items: [view as never],
        nextCursor: 'cursor-1',
      });

      const result = await controller.listRevisions(
        serializingRequest,
        'memory-1',
        mockUser,
        undefined,
        '5',
      );

      expect(revisionsService.list).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID }),
        'memory-1',
        { cursor: undefined, limit: 5 },
      );
      expect(result).toMatchObject({ meta: { nextCursor: 'cursor-1' } });
    });

    it('reads one exact revision', async () => {
      revisionsService.get.mockResolvedValue(view as never);

      const result = await controller.getRevision(
        serializingRequest,
        'memory-1',
        'revision-2',
        mockUser,
      );

      expect(revisionsService.get).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID }),
        'memory-1',
        'revision-2',
      );
      expect(result).toMatchObject({ data: { id: 'revision-2' } });
    });
  });

  // ── personal / brand visibility ───────────────────────────────────────────

  describe('personal and brand memories', () => {
    const serializingRequest = { originalUrl: '/v1/agent/memories' } as Request;

    it('lists personal memories for the requesting user only', async () => {
      memoriesService.listPersonalForUser.mockResolvedValue([
        { id: 'memory-1', scope: 'personal', userId: USER_ID },
      ] as never);

      const result = await controller.listPersonal(
        serializingRequest,
        mockUser,
      );

      expect(memoriesService.listPersonalForUser).toHaveBeenCalledWith(
        USER_ID,
        ORG_ID,
      );
      expect(result).toMatchObject({
        data: [{ id: 'memory-1', type: 'agent-memory' }],
      });
    });

    it('lists brand memories inside the caller organization', async () => {
      memoriesService.listForBrand.mockResolvedValue([] as never);

      await controller.listBrand(serializingRequest, 'brand-9', mockUser);

      expect(memoriesService.listForBrand).toHaveBeenCalledWith(
        'brand-9',
        ORG_ID,
      );
    });

    it('archives a personal memory as its author', async () => {
      memoriesService.archivePersonalMemory.mockResolvedValue({
        id: 'memory-1',
        isDeleted: true,
      } as never);

      await controller.archivePersonal(
        serializingRequest,
        'memory-1',
        mockUser,
      );

      expect(memoriesService.archivePersonalMemory).toHaveBeenCalledWith(
        'memory-1',
        USER_ID,
        ORG_ID,
      );
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns memory entries for current user', async () => {
      const mockEntries = [
        { _id: 'm1', content: 'Remember this' },
        { _id: 'm2', content: 'And this' },
      ];
      memoriesService.listForUser.mockResolvedValue(mockEntries as never);

      const result = await controller.list(mockRequest, mockUser);

      expect(memoriesService.listForUser).toHaveBeenCalledWith(USER_ID, ORG_ID);
      expect(result).toEqual(mockEntries);
    });

    it('handles errors via ErrorResponse', async () => {
      memoriesService.listForUser.mockRejectedValue(new Error('DB error'));
      const result = await controller.list(mockRequest, mockUser);
      expect(ErrorResponse.handle).toHaveBeenCalled();
      expect(result).toMatchObject({ ctx: 'listMemories' });
    });
  });

  describe('listOrganization', () => {
    it('lists org-visible memories for the current organization', async () => {
      const mockEntries = [{ id: 'm1', scope: 'brand', user: { id: USER_ID } }];
      memoriesService.listForOrganization.mockResolvedValue(
        mockEntries as never,
      );

      const result = await controller.listOrganization(mockUser, {
        limit: 15,
        page: 2,
      });

      expect(memoriesService.listForOrganization).toHaveBeenCalledWith(ORG_ID, {
        limit: 15,
        page: 2,
        skip: 15,
      });
      expect(result).toEqual(mockEntries);
    });
  });

  describe('archive', () => {
    it('archives an org-visible memory', async () => {
      const archived = { id: 'mem-1', isDeleted: true };
      memoriesService.archiveMemory.mockResolvedValue(archived as never);

      const result = await controller.archive('mem-1', mockUser);

      expect(memoriesService.archiveMemory).toHaveBeenCalledWith(
        'mem-1',
        ORG_ID,
      );
      expect(result).toEqual(archived);
    });
  });

  describe('promote', () => {
    it('promotes an org-visible memory', async () => {
      const promoted = { id: 'mem-1', promotedSkillId: 'skill-1' };
      memoriesService.promoteMemory.mockResolvedValue(promoted as never);

      const result = await controller.promote('mem-1', mockUser);

      expect(memoriesService.promoteMemory).toHaveBeenCalledWith(
        'mem-1',
        ORG_ID,
        USER_ID,
      );
      expect(result).toEqual(promoted);
    });
  });

  describe('reject', () => {
    it('rejects promotion without mutating the memory', async () => {
      const unchanged = { id: 'mem-1' };
      memoriesService.rejectMemoryPromotion.mockResolvedValue(
        unchanged as never,
      );

      const result = await controller.reject('mem-1', mockUser);

      expect(memoriesService.rejectMemoryPromotion).toHaveBeenCalledWith(
        'mem-1',
        ORG_ID,
      );
      expect(result).toEqual(unchanged);
    });
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    const baseBody = { content: 'Test memory content', tags: ['tag1'] };

    it('captures and returns memory with write flags', async () => {
      const mockMemory = { _id: 'mem1', content: 'Test memory content' };
      memoryCaptureService.capture.mockResolvedValue({
        memory: mockMemory,
        wroteBrandInsight: true,
        wroteContextMemory: false,
      } as never);

      const result = await controller.create(mockRequest, baseBody, mockUser);

      expect(memoryCaptureService.capture).toHaveBeenCalledWith(
        USER_ID,
        ORG_ID,
        baseBody,
        {
          origin: 'ACTOR',
          actor: {
            userId: USER_ID,
            organizationId: ORG_ID,
            isApiKey: false,
            scopes: [],
          },
        },
      );
      expect(result).toMatchObject({
        ...mockMemory,
        wroteBrandInsight: true,
        wroteContextMemory: false,
      });
    });

    it('propagates the actual authenticated API key and canonical database user independently of body provenance', async () => {
      const user = {
        ...mockUser,
        isApiKey: true,
        apiKeyId: 'current-key',
        scopes: ['memory:write'],
      };
      const body = {
        ...baseBody,
        brandId: 'brand-333',
        organizationId: 'forged-org',
        userId: 'forged-owner',
        origin: 'DERIVED_MEMORY',
        isProactive: true,
        actor: {
          userId: 'forged-owner',
          organizationId: 'forged-org',
          scopes: ['admin'],
        },
      };
      memoryCaptureService.capture.mockResolvedValue({
        memory: { id: 'memory' },
        wroteBrandInsight: false,
        wroteContextMemory: true,
      } as never);
      await controller.create(mockRequest, body, user);
      expect(memoryCaptureService.capture).toHaveBeenCalledExactlyOnceWith(
        USER_ID,
        ORG_ID,
        body,
        {
          origin: 'ACTOR',
          actor: {
            userId: USER_ID,
            organizationId: ORG_ID,
            isApiKey: true,
            apiKeyId: 'current-key',
            scopes: ['memory:write'],
          },
        },
      );
    });

    it.each([
      { ...mockUser, id: '', userId: '' },
      { ...mockUser, organizationId: '' },
    ])(
      'denies malformed authenticated identity before capture %j',
      async (user) => {
        const result = await controller.create(mockRequest, baseBody, user);
        expect(result).toMatchObject({ ctx: 'createMemory' });
        expect(memoryCaptureService.capture).not.toHaveBeenCalled();
      },
    );

    it('denies a missing authenticated user before capture', async () => {
      const result = await controller.create(
        mockRequest,
        baseBody,
        undefined as unknown as User,
      );
      expect(result).toMatchObject({ ctx: 'createMemory' });
      expect(memoryCaptureService.capture).not.toHaveBeenCalled();
    });

    it('handles errors via ErrorResponse', async () => {
      memoryCaptureService.capture.mockRejectedValue(new Error('Capture fail'));
      const result = await controller.create(mockRequest, baseBody, mockUser);
      expect(ErrorResponse.handle).toHaveBeenCalled();
      expect(result).toMatchObject({ ctx: 'createMemory' });
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    const MEMORY_ID = 'mem-to-delete';

    it('deletes memory and returns ok status', async () => {
      memoriesService.removeMemory.mockResolvedValue(undefined as never);

      const result = await controller.remove(mockRequest, MEMORY_ID, mockUser);

      expect(memoriesService.removeMemory).toHaveBeenCalledWith(
        MEMORY_ID,
        USER_ID,
        ORG_ID,
      );
      expect(result).toEqual({ status: 'ok' });
    });

    it('handles errors via ErrorResponse on delete failure', async () => {
      memoriesService.removeMemory.mockRejectedValue(
        new Error('Not authorized'),
      );
      const result = await controller.remove(mockRequest, MEMORY_ID, mockUser);
      expect(ErrorResponse.handle).toHaveBeenCalled();
      expect(result).toMatchObject({ ctx: 'deleteMemory' });
    });
  });
});

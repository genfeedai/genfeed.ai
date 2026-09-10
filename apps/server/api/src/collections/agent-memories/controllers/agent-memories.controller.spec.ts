import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import { AgentMemoryCaptureService } from '@api/collections/agent-memories/services/agent-memory-capture.service';
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentMemoriesController],
      providers: [
        {
          provide: AgentMemoriesService,
          useValue: {
            archiveMemory: vi.fn(),
            listForOrganization: vi.fn(),
            listForUser: vi.fn(),
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
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
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

      const result = await controller.listOrganization(mockUser);

      expect(memoriesService.listForOrganization).toHaveBeenCalledWith(ORG_ID);
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
      );
      expect(result).toMatchObject({
        ...mockMemory,
        wroteBrandInsight: true,
        wroteContextMemory: false,
      });
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

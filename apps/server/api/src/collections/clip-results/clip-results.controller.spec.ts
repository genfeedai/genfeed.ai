import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ClipResultsController } from '@api/collections/clip-results/clip-results.controller';
import type { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
import { testId } from '@helpers/testing/test-id.helper';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  returnNotFound: vi.fn().mockReturnValue({ errors: [{ status: '404' }] }),
  serializeCollection: vi
    .fn()
    .mockImplementation((_req, _serializer, data) => ({ data: data.docs })),
  serializeSingle: vi
    .fn()
    .mockImplementation((_req, _serializer, data) => ({ data })),
}));

function createMockLogger(): LoggerService {
  return {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    verbose: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;
}

function createMockService(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    create: vi.fn(),
    createForOrganization: vi.fn(),
    findRecentByOrganization: vi.fn(),
    findByProject: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
  };
}

describe('ClipResultsController', () => {
  const organizationId = testId('org');
  const userId = testId('user');

  let controller: ClipResultsController;
  let service: ReturnType<typeof createMockService>;

  const mockUser = {
    organizationId: organizationId,
    userId: userId,
  } as unknown as User;

  const mockReq = { headers: {}, url: '/clip-results' } as unknown as Request;

  beforeEach(() => {
    service = createMockService();
    controller = new ClipResultsController(
      service as unknown as ClipResultsService,
      createMockLogger(),
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a clip result with organization and user from metadata', async () => {
      const dto = {
        duration: 30,
        endTime: 45,
        index: 0,
        projectId: 'project-1',
        startTime: 15,
        title: 'Clip title',
      };
      const created = { id: 'cr-1', ...dto } as unknown as ClipResultDocument;
      service.createForOrganization.mockResolvedValue(created);

      const result = await controller.create(mockReq, dto as never, mockUser);

      expect(service.createForOrganization).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId,
          userId,
        }),
      );
      expect(result).toEqual({ data: created });
    });
  });

  describe('findAll', () => {
    it('should find by project when projectId query param is provided', async () => {
      const docs = [{ id: 'cr-1' }];
      service.findByProject.mockResolvedValue(docs);

      await controller.findAll(mockReq, 'project-1', '', mockUser);

      expect(service.findByProject).toHaveBeenCalledWith(
        'project-1',
        organizationId,
        100,
      );
      expect(service.findRecentByOrganization).not.toHaveBeenCalled();
    });

    it('should find by project when filter[project] query param is provided', async () => {
      const docs = [{ id: 'cr-1' }];
      service.findByProject.mockResolvedValue(docs);

      await controller.findAll(mockReq, '', 'project-2', mockUser);

      expect(service.findByProject).toHaveBeenCalledWith(
        'project-2',
        organizationId,
        100,
      );
    });

    it('should find all by organization when no project filter is given', async () => {
      const docs = [{ id: 'cr-1' }, { id: 'cr-2' }];
      service.findRecentByOrganization.mockResolvedValue(docs);

      await controller.findAll(mockReq, '', '', mockUser);

      expect(service.findRecentByOrganization).toHaveBeenCalledWith(
        organizationId,
        100,
      );
      expect(service.findByProject).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a serialized clip result when found', async () => {
      const doc = { id: 'cr-1', isDeleted: false };
      service.findOne.mockResolvedValue(doc);

      const result = await controller.findOne(mockReq, 'cr-1', mockUser);

      expect(service.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'cr-1',
          organizationId,
        }),
      );
      expect(result).toEqual({ data: doc });
    });

    it('should return not found when clip result does not exist', async () => {
      service.findOne.mockResolvedValue(null);

      const result = await controller.findOne(mockReq, 'nonexistent', mockUser);

      expect(result).toEqual({ errors: [{ status: '404' }] });
    });
  });

  describe('update', () => {
    it('should patch a clip result when it exists', async () => {
      const existing = { id: 'cr-1', isDeleted: false };
      const updated = {
        id: 'cr-1',
        status: 'completed',
      } as unknown as ClipResultDocument;
      service.findOne.mockResolvedValue(existing);
      service.patch.mockResolvedValue(updated);

      const result = await controller.update(
        mockReq,
        'cr-1',
        { status: 'completed' } as never,
        mockUser,
      );

      expect(service.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'cr-1',
          organizationId,
        }),
      );
      expect(service.patch).toHaveBeenCalledWith('cr-1', {
        status: 'completed',
      });
      expect(result).toEqual({ data: updated });
    });

    it('should return not found when clip result to update does not exist', async () => {
      service.findOne.mockResolvedValue(null);

      const result = await controller.update(
        mockReq,
        'nonexistent',
        {} as never,
        mockUser,
      );

      expect(result).toEqual({ errors: [{ status: '404' }] });
      expect(service.patch).not.toHaveBeenCalled();
    });
  });
});

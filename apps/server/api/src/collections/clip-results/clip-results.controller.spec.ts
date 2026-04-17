import { ClipResultsController } from '@api/collections/clip-results/clip-results.controller';
import type { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
import type { User } from '@clerk/backend';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn().mockReturnValue({
    organization: '507f1f77bcf86cd799439012',
    user: '507f1f77bcf86cd799439011',
  }),
}));

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
    findAllByOrganization: vi.fn(),
    findByProject: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
  };
}

describe('ClipResultsController', () => {
  const organizationId = '507f1f77bcf86cd799439012';
  const userId = '507f1f77bcf86cd799439011';

  let controller: ClipResultsController;
  let service: ReturnType<typeof createMockService>;

  const mockUser = {
    publicMetadata: { organization: organizationId, user: userId },
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
      const dto = { clip: 'clip-1', project: 'project-1' };
      const created = { _id: 'cr-1', ...dto } as unknown as ClipResultDocument;
      service.create.mockResolvedValue(created);

      const result = await controller.create(mockReq, dto as never, mockUser);

      expect(service.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organization: expect.any(Types.ObjectId),
          user: expect.any(Types.ObjectId),
        }),
      );
      expect(result).toEqual({ data: created });
    });
  });

  describe('findAll', () => {
    it('should find by project when projectId query param is provided', async () => {
      const docs = [{ _id: 'cr-1' }];
      service.findByProject.mockResolvedValue(docs);

      await controller.findAll(mockReq, 'project-1', '', mockUser);

      expect(service.findByProject).toHaveBeenCalledWith('project-1');
      expect(service.findAllByOrganization).not.toHaveBeenCalled();
    });

    it('should find by project when filter[project] query param is provided', async () => {
      const docs = [{ _id: 'cr-1' }];
      service.findByProject.mockResolvedValue(docs);

      await controller.findAll(mockReq, '', 'project-2', mockUser);

      expect(service.findByProject).toHaveBeenCalledWith('project-2');
    });

    it('should find all by organization when no project filter is given', async () => {
      const docs = [{ _id: 'cr-1' }, { _id: 'cr-2' }];
      service.findAllByOrganization.mockResolvedValue(docs);

      await controller.findAll(mockReq, '', '', mockUser);

      expect(service.findAllByOrganization).toHaveBeenCalledWith(
        organizationId,
      );
      expect(service.findByProject).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a serialized clip result when found', async () => {
      const doc = { _id: 'cr-1', isDeleted: false };
      service.findOne.mockResolvedValue(doc);

      const result = await controller.findOne(mockReq, 'cr-1', mockUser);

      expect(service.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: 'cr-1',
          isDeleted: false,
          organization: expect.any(Types.ObjectId),
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
      const existing = { _id: 'cr-1', isDeleted: false };
      const updated = {
        _id: 'cr-1',
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
          _id: 'cr-1',
          isDeleted: false,
          organization: expect.any(Types.ObjectId),
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

import { NewslettersController } from '@api/collections/newsletters/controllers/newsletters.controller';
import { NewslettersService } from '@api/collections/newsletters/services/newsletters.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { User } from '@clerk/backend';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  extractRequestContext: vi.fn().mockReturnValue({
    organizationId: '507f1f77bcf86cd799439012',
    userId: '507f1f77bcf86cd799439011',
  }),
}));

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi
    .fn()
    .mockImplementation((_req, _serializer, data) => ({ data: data.docs })),
  serializeSingle: vi
    .fn()
    .mockImplementation((_req, _serializer, data) => ({ data })),
}));

describe('NewslettersController', () => {
  let controller: NewslettersController;
  let service: {
    approveScoped: ReturnType<typeof vi.fn>;
    archiveScoped: ReturnType<typeof vi.fn>;
    createScoped: ReturnType<typeof vi.fn>;
    findAllScoped: ReturnType<typeof vi.fn>;
    findOneScoped: ReturnType<typeof vi.fn>;
    generateDraft: ReturnType<typeof vi.fn>;
    generateTopicProposals: ReturnType<typeof vi.fn>;
    getContextPreview: ReturnType<typeof vi.fn>;
    publishScoped: ReturnType<typeof vi.fn>;
    updateScoped: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockReq = { headers: {}, url: '/newsletters' } as unknown as Request;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NewslettersController],
      providers: [
        {
          provide: NewslettersService,
          useValue: {
            approveScoped: vi
              .fn()
              .mockResolvedValue({ _id: 'nl-1', status: 'approved' }),
            archiveScoped: vi
              .fn()
              .mockResolvedValue({ _id: 'nl-1', status: 'archived' }),
            createScoped: vi
              .fn()
              .mockResolvedValue({ _id: 'nl-1', title: 'New Newsletter' }),
            findAllScoped: vi.fn().mockResolvedValue({
              docs: [{ _id: 'nl-1' }],
              limit: 10,
              page: 1,
              totalDocs: 1,
              totalPages: 1,
            }),
            findOneScoped: vi.fn().mockResolvedValue({ _id: 'nl-1' }),
            generateDraft: vi
              .fn()
              .mockResolvedValue({ _id: 'nl-1', draft: 'content' }),
            generateTopicProposals: vi
              .fn()
              .mockResolvedValue(['Topic 1', 'Topic 2']),
            getContextPreview: vi
              .fn()
              .mockResolvedValue({ context: 'preview' }),
            publishScoped: vi
              .fn()
              .mockResolvedValue({ _id: 'nl-1', status: 'published' }),
            updateScoped: vi
              .fn()
              .mockResolvedValue({ _id: 'nl-1', title: 'Updated' }),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(NewslettersController);
    service = module.get(NewslettersService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call findAllScoped and return serialized collection', async () => {
      const query = { limit: 10, page: 1, pagination: true } as never;
      await controller.findAll(mockReq, mockUser, query);

      expect(service.findAllScoped).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: '507f1f77bcf86cd799439012' }),
        query,
        expect.objectContaining({ limit: 10, page: 1, pagination: true }),
      );
    });
  });

  describe('findOne', () => {
    it('should find a single newsletter scoped to context', async () => {
      const result = await controller.findOne(mockReq, mockUser, 'nl-1');

      expect(service.findOneScoped).toHaveBeenCalledWith(
        'nl-1',
        expect.objectContaining({ organizationId: '507f1f77bcf86cd799439012' }),
      );
      expect(result).toEqual({ data: { _id: 'nl-1' } });
    });
  });

  describe('create', () => {
    it('should create a newsletter with scoped context', async () => {
      const dto = { title: 'New Newsletter' } as never;
      const result = await controller.create(mockReq, mockUser, dto);

      expect(service.createScoped).toHaveBeenCalledWith(
        dto,
        expect.objectContaining({ organizationId: '507f1f77bcf86cd799439012' }),
      );
      expect(result).toEqual({
        data: { _id: 'nl-1', title: 'New Newsletter' },
      });
    });
  });

  describe('patch', () => {
    it('should update a newsletter with scoped context', async () => {
      const dto = { title: 'Updated' } as never;
      const result = await controller.patch(mockReq, mockUser, 'nl-1', dto);

      expect(service.updateScoped).toHaveBeenCalledWith(
        'nl-1',
        dto,
        expect.objectContaining({ organizationId: '507f1f77bcf86cd799439012' }),
      );
      expect(result).toEqual({ data: { _id: 'nl-1', title: 'Updated' } });
    });
  });

  describe('topicProposals', () => {
    it('should generate topic proposals and return data wrapper', async () => {
      const dto = { brandId: 'brand-1' } as never;
      const result = await controller.topicProposals(mockUser, dto);

      expect(service.generateTopicProposals).toHaveBeenCalledWith(
        dto,
        expect.objectContaining({ organizationId: '507f1f77bcf86cd799439012' }),
      );
      expect(result).toEqual({ data: ['Topic 1', 'Topic 2'] });
    });
  });

  describe('generateDraft', () => {
    it('should generate a newsletter draft', async () => {
      const dto = { newsletterId: 'nl-1' } as never;
      const result = await controller.generateDraft(mockReq, mockUser, dto);

      expect(service.generateDraft).toHaveBeenCalledWith(
        dto,
        expect.objectContaining({ organizationId: '507f1f77bcf86cd799439012' }),
      );
      expect(result).toEqual({
        data: { _id: 'nl-1', draft: 'content' },
      });
    });
  });

  describe('context', () => {
    it('should return context preview for a newsletter', async () => {
      const result = await controller.context(mockUser, 'nl-1');

      expect(service.getContextPreview).toHaveBeenCalledWith(
        'nl-1',
        expect.objectContaining({ organizationId: '507f1f77bcf86cd799439012' }),
      );
      expect(result).toEqual({ data: { context: 'preview' } });
    });
  });

  describe('approve', () => {
    it('should approve a newsletter', async () => {
      const result = await controller.approve(mockReq, mockUser, 'nl-1');

      expect(service.approveScoped).toHaveBeenCalledWith(
        'nl-1',
        expect.objectContaining({ organizationId: '507f1f77bcf86cd799439012' }),
      );
      expect(result).toEqual({
        data: { _id: 'nl-1', status: 'approved' },
      });
    });
  });

  describe('publish', () => {
    it('should publish a newsletter', async () => {
      const result = await controller.publish(mockReq, mockUser, 'nl-1');

      expect(service.publishScoped).toHaveBeenCalledWith(
        'nl-1',
        expect.objectContaining({ organizationId: '507f1f77bcf86cd799439012' }),
      );
      expect(result).toEqual({
        data: { _id: 'nl-1', status: 'published' },
      });
    });
  });

  describe('archive', () => {
    it('should archive a newsletter', async () => {
      const result = await controller.archive(mockReq, mockUser, 'nl-1');

      expect(service.archiveScoped).toHaveBeenCalledWith(
        'nl-1',
        expect.objectContaining({ organizationId: '507f1f77bcf86cd799439012' }),
      );
      expect(result).toEqual({
        data: { _id: 'nl-1', status: 'archived' },
      });
    });
  });
});

import { NewslettersService } from '@api/collections/newsletters/services/newsletters.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('NewslettersService', () => {
  let service: NewslettersService;

  const mockModel = {
    collection: { name: 'newsletters' },
  };

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService;

  const mockOpenRouterService = {
    chatCompletion: vi.fn(),
  };

  const mockBrandsService = {
    findOne: vi.fn(),
  };

  const tenantContext = {
    brandId: new Types.ObjectId().toString(),
    organizationId: new Types.ObjectId().toString(),
    userId: new Types.ObjectId().toString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new NewslettersService(
      mockModel as never,
      mockLogger,
      mockOpenRouterService as never,
      mockBrandsService as never,
    );
  });

  describe('buildListPipeline', () => {
    it('always scopes aggregation by organization, brand, and non-deleted records', () => {
      const pipeline = service.buildListPipeline(tenantContext, {
        search: 'signal',
        status: ['published'],
      });

      expect(pipeline[0]).toEqual({
        $match: {
          $or: [
            { label: { $options: 'i', $regex: 'signal' } },
            { topic: { $options: 'i', $regex: 'signal' } },
            { content: { $options: 'i', $regex: 'signal' } },
          ],
          brand: new Types.ObjectId(tenantContext.brandId),
          isDeleted: false,
          organization: new Types.ObjectId(tenantContext.organizationId),
          status: { $in: ['published'] },
        },
      });
    });
  });

  describe('publishScoped', () => {
    it('marks the newsletter as published and preserves prior approval if present', async () => {
      const approvedAt = new Date('2026-03-01T10:00:00.000Z');
      const approvedByUser = new Types.ObjectId();
      const patchSpy = vi
        .spyOn(service, 'patch')
        .mockResolvedValue({ _id: new Types.ObjectId() } as never);

      vi.spyOn(service, 'findOneScoped').mockResolvedValue({
        _id: new Types.ObjectId(),
        approvedAt,
        approvedByUser,
        content: '# Published issue',
      } as never);

      await service.publishScoped(
        new Types.ObjectId().toString(),
        tenantContext,
      );

      expect(patchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          approvedAt,
          approvedByUser,
          publishedAt: expect.any(Date),
          publishedByUser: expect.any(Types.ObjectId),
          status: 'published',
        }),
        ['organization', 'brand', 'user'],
      );
    });

    it('rejects publishing empty newsletters', async () => {
      vi.spyOn(service, 'findOneScoped').mockResolvedValue({
        _id: new Types.ObjectId(),
        content: '   ',
      } as never);

      await expect(
        service.publishScoped(new Types.ObjectId().toString(), tenantContext),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getContextPreview', () => {
    it('returns selected context, brand voice, and newsletter source refs', async () => {
      const contextNewsletterId = new Types.ObjectId();
      const publishedNewsletterId = new Types.ObjectId();

      vi.spyOn(service, 'findOneScoped').mockResolvedValue({
        _id: new Types.ObjectId(),
        contextNewsletterIds: [contextNewsletterId],
        sourceRefs: [
          {
            label: 'Source one',
            note: 'Important note',
            sourceType: 'url',
            url: 'https://example.com',
          },
        ],
        status: 'ready_for_review',
        summary: 'Draft summary',
        topic: 'Newsletter topic',
        updatedAt: new Date('2026-03-10T12:00:00.000Z'),
      } as never);

      mockBrandsService.findOne.mockResolvedValue({
        agentConfig: {
          voice: {
            tone: 'direct',
          },
        },
      });

      const findAllSpy = vi.spyOn(service, 'findAll').mockResolvedValue({
        docs: [
          {
            _id: publishedNewsletterId,
            label: 'Latest published issue',
            publishedAt: new Date('2026-03-09T09:00:00.000Z'),
            status: 'published',
            summary: 'Published summary',
            topic: 'Published topic',
          },
        ],
      } as never);

      const findSpy = vi.spyOn(service, 'find').mockResolvedValue([
        {
          _id: contextNewsletterId,
          label: 'Context issue',
          publishedAt: new Date('2026-03-08T09:00:00.000Z'),
          status: 'published',
          summary: 'Context summary',
          topic: 'Context topic',
        },
      ] as never);

      const preview = await service.getContextPreview(
        new Types.ObjectId().toString(),
        tenantContext,
      );

      expect(findAllSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            $match: expect.objectContaining({
              brand: new Types.ObjectId(tenantContext.brandId),
              isDeleted: false,
              organization: new Types.ObjectId(tenantContext.organizationId),
              status: 'published',
            }),
          }),
        ]),
        { pagination: false },
      );
      expect(findSpy).toHaveBeenCalledWith({
        _id: { $in: [new Types.ObjectId(contextNewsletterId)] },
        brand: tenantContext.brandId,
        isDeleted: false,
        organization: tenantContext.organizationId,
      });
      expect(preview).toEqual({
        brandVoice: { tone: 'direct' },
        contextSources: [],
        recentNewsletters: [
          {
            id: publishedNewsletterId.toString(),
            label: 'Latest published issue',
            publishedAt: new Date('2026-03-09T09:00:00.000Z'),
            status: 'published',
            summary: 'Published summary',
            topic: 'Published topic',
          },
        ],
        selectedContext: [
          {
            id: contextNewsletterId.toString(),
            label: 'Context issue',
            publishedAt: new Date('2026-03-08T09:00:00.000Z'),
            status: 'published',
            summary: 'Context summary',
            topic: 'Context topic',
          },
        ],
        selectedContextIds: [contextNewsletterId.toString()],
        sourceRefs: [
          {
            label: 'Source one',
            note: 'Important note',
            sourceType: 'url',
            url: 'https://example.com',
          },
        ],
        status: 'ready_for_review',
        summary: 'Draft summary',
        topic: 'Newsletter topic',
        updatedAt: new Date('2026-03-10T12:00:00.000Z'),
      });
    });
  });
});

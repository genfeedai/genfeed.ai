import {
  RedirectController,
  TrackedLinksController,
} from '@api/collections/tracked-links/controllers/tracked-links.controller';
import { CreateTrackedLinkDto } from '@api/collections/tracked-links/dto/create-tracked-link.dto';
import { TrackClickDto } from '@api/collections/tracked-links/dto/track-click.dto';
import { TrackedLinksService } from '@api/collections/tracked-links/services/tracked-links.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';

// Mock serializers to avoid real serialization in unit tests
vi.mock('@genfeedai/serializers', () => ({
  TrackedLinkSerializer: {
    opts: {},
    serialize: vi.fn((data) => data),
  },
}));

// Mock response util to return data directly
vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn((_req, _serializer, data) => data),
  serializeSingle: vi.fn((_req, _serializer, data) => data),
}));

describe('TrackedLinksController', () => {
  let controller: TrackedLinksController;
  let service: TrackedLinksService;

  const mockUser: User = {
    publicMetadata: {
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockTrackedLink = {
    _id: '507f1f77bcf86cd799439014',
    clicks: 0,
    contentId: 'content123',
    createdAt: new Date(),
    organization: '507f1f77bcf86cd799439012',
    originalUrl: 'https://example.com',
    shortCode: 'abc123',
  };

  const mockReq = { originalUrl: '/tracking/links' } as unknown as Request;

  const mockTrackedLinksService = {
    delete: vi.fn(),
    generateTrackingLink: vi.fn(),
    getById: vi.fn(),
    getByShortCode: vi.fn(),
    getContentCTAStats: vi.fn(),
    getContentLinks: vi.fn(),
    getLinkPerformance: vi.fn(),
    getOrganizationLinks: vi.fn(),
    trackClick: vi.fn(),
    update: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrackedLinksController],
      providers: [
        {
          provide: TrackedLinksService,
          useValue: mockTrackedLinksService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TrackedLinksController>(TrackedLinksController);
    service = module.get<TrackedLinksService>(TrackedLinksService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('generateLink', () => {
    it('should generate a tracking link', async () => {
      const dto: CreateTrackedLinkDto = {
        contentId: 'content123',
        url: 'https://example.com',
      };

      mockTrackedLinksService.generateTrackingLink.mockResolvedValue(
        mockTrackedLink,
      );

      const result = await controller.generateLink(mockReq, dto, mockUser);

      expect(service.generateTrackingLink).toHaveBeenCalledWith(
        dto,
        mockUser.publicMetadata.organization,
      );
      expect(result).toBeDefined();
    });
  });

  describe('getLink', () => {
    it('should return a tracked link by id', async () => {
      const linkId = '507f1f77bcf86cd799439014';
      mockTrackedLinksService.getById.mockResolvedValue(mockTrackedLink);

      const result = await controller.getLink(mockReq, linkId, mockUser);

      expect(service.getById).toHaveBeenCalledWith(
        linkId,
        mockUser.publicMetadata.organization,
      );
      expect(result).toBeDefined();
    });
  });

  describe('getLinks', () => {
    it('should return content links when contentId provided', async () => {
      const contentId = 'content123';
      const links = [mockTrackedLink];

      mockTrackedLinksService.getContentLinks.mockResolvedValue(links);

      const result = await controller.getLinks(
        mockReq,
        contentId,
        undefined,
        undefined,
        mockUser,
      );

      expect(service.getContentLinks).toHaveBeenCalledWith(
        contentId,
        mockUser.publicMetadata.organization,
      );
      expect(result).toBeDefined();
    });

    it('should return organization links when no contentId', async () => {
      const links = [mockTrackedLink];
      mockTrackedLinksService.getOrganizationLinks.mockResolvedValue(links);

      const result = await controller.getLinks(
        mockReq,
        undefined,
        'twitter',
        'summer-campaign',
        mockUser,
      );

      expect(service.getOrganizationLinks).toHaveBeenCalledWith(
        mockUser.publicMetadata.organization,
        {
          campaignName: 'summer-campaign',
          platform: 'twitter',
        },
      );
      expect(result).toBeDefined();
    });
  });

  describe('getLinkPerformance', () => {
    it('should return link performance', async () => {
      const linkId = '507f1f77bcf86cd799439014';
      const performance = {
        clicks: 150,
        conversionRate: 0.15,
        uniqueClicks: 120,
      };

      mockTrackedLinksService.getLinkPerformance.mockResolvedValue(performance);

      const result = await controller.getLinkPerformance(linkId, mockUser);

      expect(service.getLinkPerformance).toHaveBeenCalledWith(
        linkId,
        mockUser.publicMetadata.organization,
      );
      expect(result).toEqual(performance);
    });
  });

  describe('getContentCTAStats', () => {
    it('should return CTA stats for content', async () => {
      const contentId = 'content123';
      const stats = {
        ctaPerformance: [
          { clicks: 300, cta: 'Learn More' },
          { clicks: 200, cta: 'Sign Up' },
        ],
        totalClicks: 500,
      };

      mockTrackedLinksService.getContentCTAStats.mockResolvedValue(stats);

      const result = await controller.getContentCTAStats(contentId, mockUser);

      expect(service.getContentCTAStats).toHaveBeenCalledWith(
        contentId,
        mockUser.publicMetadata.organization,
      );
      expect(result).toEqual(stats);
    });
  });

  describe('updateLink', () => {
    it('should update a tracked link', async () => {
      const linkId = '507f1f77bcf86cd799439014';
      const updates = { campaignName: 'Updated Campaign' };

      const updated = { ...mockTrackedLink, ...updates };
      mockTrackedLinksService.update.mockResolvedValue(updated);

      const result = await controller.updateLink(
        mockReq,
        linkId,
        updates,
        mockUser,
      );

      expect(service.update).toHaveBeenCalledWith(
        linkId,
        mockUser.publicMetadata.organization,
        updates,
      );
      expect(result).toBeDefined();
    });
  });

  describe('deleteLink', () => {
    it('should delete a tracked link', async () => {
      const linkId = '507f1f77bcf86cd799439014';
      mockTrackedLinksService.delete.mockResolvedValue(undefined);

      const result = await controller.deleteLink(linkId, mockUser);

      expect(service.delete).toHaveBeenCalledWith(
        linkId,
        mockUser.publicMetadata.organization,
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('trackClick', () => {
    it('should track a click', async () => {
      const dto: TrackClickDto = {
        linkId: '507f1f77bcf86cd799439014',
        sessionId: 'session123',
      };

      const req = { headers: {}, ip: '127.0.0.1' } as Request;
      mockTrackedLinksService.trackClick.mockResolvedValue(undefined);

      const result = await controller.trackClick(dto, req);

      expect(service.trackClick).toHaveBeenCalledWith(dto, {
        headers: req.headers,
        ip: req.ip,
      });
      expect(result).toEqual({ success: true });
    });
  });
});

describe('RedirectController', () => {
  let controller: RedirectController;
  let service: TrackedLinksService;

  const mockTrackedLink = {
    _id: '507f1f77bcf86cd799439014',
    expiresAt: null,
    originalUrl: 'https://example.com',
    shortCode: 'abc123',
  };

  const mockTrackedLinksService = {
    getByShortCode: vi.fn(),
    trackClick: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RedirectController],
      providers: [
        {
          provide: TrackedLinksService,
          useValue: mockTrackedLinksService,
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RedirectController>(RedirectController);
    service = module.get<TrackedLinksService>(TrackedLinksService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('redirect', () => {
    it('should redirect to original URL', async () => {
      const shortCode = 'abc123';
      const req = {
        headers: {},
        ip: '127.0.0.1',
      } as Request;
      const res = {
        redirect: vi.fn(),
        send: vi.fn(),
        status: vi.fn().mockReturnThis(),
      } as unknown as Response;

      mockTrackedLinksService.getByShortCode.mockResolvedValue(mockTrackedLink);
      mockTrackedLinksService.trackClick.mockResolvedValue(undefined);

      await controller.redirect(shortCode, req, res);

      expect(service.getByShortCode).toHaveBeenCalledWith(shortCode);
      expect(res.redirect).toHaveBeenCalledWith(
        302,
        mockTrackedLink.originalUrl,
      );
    });

    it('should return 404 when link not found', async () => {
      const shortCode = 'invalid';
      const req = {} as Request;
      const res = {
        send: vi.fn(),
        status: vi.fn().mockReturnThis(),
      } as unknown as Response;

      mockTrackedLinksService.getByShortCode.mockResolvedValue(null);

      await controller.redirect(shortCode, req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('Link not found');
    });

    it('should return 410 when link expired', async () => {
      const shortCode = 'expired';
      const req = {} as Request;
      const res = {
        send: vi.fn(),
        status: vi.fn().mockReturnThis(),
      } as unknown as Response;

      const expiredLink = {
        ...mockTrackedLink,
        expiresAt: new Date(Date.now() - 86400000), // Yesterday
      };

      mockTrackedLinksService.getByShortCode.mockResolvedValue(expiredLink);

      await controller.redirect(shortCode, req, res);

      expect(res.status).toHaveBeenCalledWith(410);
      expect(res.send).toHaveBeenCalledWith('Link expired');
    });
  });
});

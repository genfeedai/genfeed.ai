import { CreateTrackedLinkDto } from '@api/collections/tracked-links/dto/create-tracked-link.dto';
import { TrackedLink } from '@api/collections/tracked-links/schemas/tracked-link.schema';
import { TrackedLinksService } from '@api/collections/tracked-links/services/tracked-links.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Test, TestingModule } from '@nestjs/testing';

// Mock nanoid
vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'abc12345'),
}));

describe('TrackedLinksService', () => {
  let service: TrackedLinksService;
  let trackedLinkModel: ReturnType<typeof createMockModel>;

  const mockOrganizationId = '507f1f77bcf86cd799439011';
  const mockLinkId = '507f1f77bcf86cd799439012';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrackedLinksService,
        {
          provide: PrismaService,
          useValue: {
            aggregate: vi.fn(),
            create: vi.fn(),
            find: vi.fn(),
            findById: vi.fn(),
            findByIdAndUpdate: vi.fn(),
            findOne: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TrackedLinksService>(TrackedLinksService);
    trackedLinkModel = module.get(PrismaService);

    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateTrackingLink', () => {
    it('should generate a tracking link with UTM parameters', async () => {
      const dto: CreateTrackedLinkDto = {
        campaignName: 'summer-sale',
        contentId: 'video-123',
        contentType: 'video',
        platform: 'twitter',
        url: 'https://example.com',
      };

      const mockTrackedLink = {
        _id: mockLinkId,
        campaignName: 'summer-sale',
        organizationId: mockOrganizationId,
        originalUrl: expect.stringContaining('utm_source'),
        platform: 'twitter',
        shortCode: 'abc12345',
        shortUrl: expect.stringContaining('/l/abc12345'),
      };

      trackedLinkModel.findOne.mockResolvedValue(null); // No existing link
      trackedLinkModel.create.mockResolvedValue(mockTrackedLink);

      const result = await service.generateTrackingLink(
        dto,
        mockOrganizationId,
      );

      expect(result).toBeDefined();
      expect(trackedLinkModel.create).toHaveBeenCalled();
      expect(trackedLinkModel.findOne).toHaveBeenCalled();
    });

    it('should use custom slug when provided', async () => {
      const dto: CreateTrackedLinkDto = {
        customSlug: 'my-custom-link',
        platform: 'twitter',
        url: 'https://example.com',
      };

      trackedLinkModel.findOne.mockResolvedValue(null);
      trackedLinkModel.create.mockResolvedValue({
        shortCode: 'my-custom-link',
      });

      await service.generateTrackingLink(dto, mockOrganizationId);

      expect(trackedLinkModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          shortCode: 'my-custom-link',
        }),
      );
    });

    it('should retry short code generation if collision occurs', async () => {
      const nanoidModule = await import('nanoid');
      const nanoid = nanoidModule.nanoid as vi.Mock;
      nanoid
        .mockReturnValueOnce('collision1')
        .mockReturnValueOnce('collision2')
        .mockReturnValueOnce('unique123');

      const dto: CreateTrackedLinkDto = {
        platform: 'twitter',
        url: 'https://example.com',
      };

      trackedLinkModel.findOne
        .mockResolvedValueOnce({ shortCode: 'collision1' })
        .mockResolvedValueOnce({ shortCode: 'collision2' })
        .mockResolvedValueOnce(null);

      trackedLinkModel.create.mockResolvedValue({
        shortCode: 'unique123',
      });

      await service.generateTrackingLink(dto, mockOrganizationId);

      expect(trackedLinkModel.findOne).toHaveBeenCalledTimes(3);
      expect(nanoid).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max retry attempts', async () => {
      const dto: CreateTrackedLinkDto = {
        platform: 'twitter',
        url: 'https://example.com',
      };

      trackedLinkModel.findOne.mockResolvedValue({ shortCode: 'exists' });

      await expect(
        service.generateTrackingLink(dto, mockOrganizationId),
      ).rejects.toThrow('Failed to generate unique short code');

      expect(trackedLinkModel.findOne).toHaveBeenCalledTimes(5);
    });

    /**
     * CRITICAL SECURITY TEST: Ensure shortCode uniqueness is checked GLOBALLY
     * across all organizations to prevent cross-organization collisions
     */
    it('should reject custom slug if already used by ANY organization', async () => {
      const dto: CreateTrackedLinkDto = {
        customSlug: 'promo2024',
        platform: 'twitter',
        url: 'https://example.com',
      };

      const org1Id = '507f1f77bcf86cd799439011';
      const org2Id = '507f1f77bcf86cd799439099'; // Different organization

      // Simulate that org1 already has this slug
      trackedLinkModel.findOne.mockResolvedValue({
        isDeleted: false,
        organizationId: org1Id,
        shortCode: 'promo2024',
      });

      // Org2 tries to create the same slug - should be REJECTED
      await expect(service.generateTrackingLink(dto, org2Id)).rejects.toThrow(
        'Custom slug "promo2024" is already in use. Please choose a different slug.',
      );

      // Verify the check was GLOBAL (no organizationId filter)
      expect(trackedLinkModel.findOne).toHaveBeenCalledWith({
        isDeleted: false,
        shortCode: 'promo2024',
      });
    });

    /**
     * CRITICAL SECURITY TEST: Ensure random shortCode generation avoids
     * collisions across organizations
     */
    it('should regenerate shortCode if collision with another organization', async () => {
      const nanoidModule = await import('nanoid');
      const nanoid = nanoidModule.nanoid as vi.Mock;
      nanoid
        .mockReturnValueOnce('abc12345') // Collision with org1
        .mockReturnValueOnce('xyz67890'); // Unique

      const dto: CreateTrackedLinkDto = {
        platform: 'twitter',
        url: 'https://example.com',
      };

      const org1Id = '507f1f77bcf86cd799439011';
      const org2Id = '507f1f77bcf86cd799439099';

      // First check finds collision with org1
      trackedLinkModel.findOne
        .mockResolvedValueOnce({
          isDeleted: false,
          organizationId: org1Id,
          shortCode: 'abc12345',
        })
        .mockResolvedValueOnce(null); // Second code is unique

      trackedLinkModel.create.mockResolvedValue({
        organizationId: org2Id,
        shortCode: 'xyz67890',
      });

      await service.generateTrackingLink(dto, org2Id);

      // Should have checked globally both times
      expect(trackedLinkModel.findOne).toHaveBeenCalledWith({
        isDeleted: false,
        shortCode: 'abc12345',
      });
      expect(trackedLinkModel.findOne).toHaveBeenCalledWith({
        isDeleted: false,
        shortCode: 'xyz67890',
      });
      expect(trackedLinkModel.findOne).toHaveBeenCalledTimes(2);
    });
  });
});

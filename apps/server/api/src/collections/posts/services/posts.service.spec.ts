import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { Post } from '@api/collections/posts/schemas/post.schema';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { mockModel } from '@api/helpers/mocks/model.mock';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('PostsService', () => {
  let service: PostsService;
  let organizationSettingsService: {
    findOne: ReturnType<typeof vi.fn>;
    normalizeJourneyState: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
  let creditsUtilsService: {
    addOrganizationCreditsWithExpiration: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    organizationSettingsService = {
      findOne: vi.fn(),
      normalizeJourneyState: vi.fn(),
      patch: vi.fn(),
    };
    creditsUtilsService = {
      addOrganizationCreditsWithExpiration: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: mockModel },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: OrganizationSettingsService,
          useValue: organizationSettingsService,
        },
        {
          provide: CreditsUtilsService,
          useValue: creditsUtilsService,
        },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('finds all posts', async () => {
    const aggregateMock = vi.fn().mockReturnValue('agg');
    const paginateMock = vi.fn().mockResolvedValue('data');
    service.model.aggregate = aggregateMock;
    service.model.aggregatePaginate = paginateMock;

    const result = await service.findAll([], {});
    expect(aggregateMock).toHaveBeenCalledWith([]);
    expect(paginateMock).toHaveBeenCalledWith('agg', {});
    expect(result).toBe('data');
  });

  describe('findByIds', () => {
    it('returns empty array for empty ids input', async () => {
      const result = await service.findByIds([], 'org-123');
      expect(result).toEqual([]);
    });

    it('returns empty array for null-like ids', async () => {
      const result = await service.findByIds(undefined as never, 'org-123');
      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('calls model.findOne with params', async () => {
      const doc = { _id: 'p1', description: 'test' };
      const execMock = vi.fn().mockResolvedValue(doc);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      service.model.findOne = vi
        .fn()
        .mockReturnValue({ populate: populateMock });

      const result = await service.findOne({ _id: 'p1' });
      expect(result).toEqual(doc);
    });

    it('returns null when no document matches', async () => {
      const execMock = vi.fn().mockResolvedValue(null);
      const populateMock = vi.fn().mockReturnValue({ exec: execMock });
      service.model.findOne = vi
        .fn()
        .mockReturnValue({ populate: populateMock });

      const result = await service.findOne({ _id: 'missing' });
      expect(result).toBeNull();
    });
  });

  describe('patch publish journey completion', () => {
    const organizationId = 'test-object-id'.toString();
    const currentPost = {
      _id: 'post-1',
      organization: new string(organizationId),
      status: PostStatus.DRAFT,
    } as never;
    const updatedPost = {
      _id: 'post-1',
      organization: new string(organizationId),
      status: PostStatus.PUBLIC,
    };
    const settings = {
      _id: 'settings-1',
      onboardingJourneyCompletedAt: null,
      onboardingJourneyMissions: [],
    };

    beforeEach(() => {
      vi.spyOn(service, 'findOne').mockResolvedValue(currentPost);
      service.model.findByIdAndUpdate = vi.fn().mockReturnValue({
        populate: vi.fn().mockReturnValue({
          exec: vi.fn().mockResolvedValue(updatedPost),
        }),
      });
      organizationSettingsService.findOne.mockResolvedValue(settings);
    });

    it('claims publish_first_post the first time a post becomes public', async () => {
      organizationSettingsService.normalizeJourneyState.mockReturnValue([
        {
          completedAt: null,
          id: 'publish_first_post',
          isCompleted: false,
          rewardClaimed: false,
          rewardCredits: 30,
        },
      ]);

      await service.patch('post-1', { status: PostStatus.PUBLIC });

      expect(organizationSettingsService.patch).toHaveBeenCalledWith(
        'settings-1',
        expect.objectContaining({
          onboardingJourneyCompletedAt: expect.any(Date),
          onboardingJourneyMissions: [
            expect.objectContaining({
              completedAt: expect.any(Date),
              id: 'publish_first_post',
              isCompleted: true,
              rewardClaimed: true,
            }),
          ],
        }),
      );
      expect(
        creditsUtilsService.addOrganizationCreditsWithExpiration,
      ).toHaveBeenCalledWith(
        organizationId,
        30,
        'onboarding-journey',
        'Onboarding journey reward: publish_first_post',
        expect.any(Date),
      );
    });

    it('does not claim duplicate credits when the mission is already rewarded', async () => {
      organizationSettingsService.normalizeJourneyState.mockReturnValue([
        {
          completedAt: new Date(),
          id: 'publish_first_post',
          isCompleted: true,
          rewardClaimed: true,
          rewardCredits: 30,
        },
      ]);

      await service.patch('post-1', { status: PostStatus.PUBLIC });

      expect(organizationSettingsService.patch).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.addOrganizationCreditsWithExpiration,
      ).not.toHaveBeenCalled();
    });

    it('does not re-run the publish reward when the post was already public', async () => {
      vi.spyOn(service, 'findOne').mockResolvedValue({
        ...currentPost,
        status: PostStatus.PUBLIC,
      } as never);

      await service.patch('post-1', { status: PostStatus.PUBLIC });

      expect(organizationSettingsService.findOne).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.addOrganizationCreditsWithExpiration,
      ).not.toHaveBeenCalled();
    });
  });
});

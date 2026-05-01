import { CampaignTargetsService } from '@api/collections/campaign-targets/services/campaign-targets.service';
import { OutreachCampaignsController } from '@api/collections/outreach-campaigns/controllers/outreach-campaigns.controller';
import { OutreachCampaignsService } from '@api/collections/outreach-campaigns/services/outreach-campaigns.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { CampaignDiscoveryService } from '@api/services/campaign/campaign-discovery.service';
import { CampaignExecutorService } from '@api/services/campaign/campaign-executor.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('OutreachCampaignsController', () => {
  let controller: OutreachCampaignsController;

  beforeEach(async () => {
    const mockService = {
      create: vi.fn(),
      find: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      findOneById: vi.fn(),
      patch: vi.fn(),
      remove: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OutreachCampaignsController],
      providers: [
        { provide: OutreachCampaignsService, useValue: mockService },
        {
          provide: CampaignTargetsService,
          useValue: { findByCampaign: vi.fn() },
        },
        {
          provide: CampaignDiscoveryService,
          useValue: { discoverTargets: vi.fn() },
        },
        {
          provide: CampaignExecutorService,
          useValue: { executeTarget: vi.fn() },
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

    controller = module.get<OutreachCampaignsController>(
      OutreachCampaignsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('buildFindAllQuery', () => {
    it('should build query with organization and brand filter', () => {
      const brandId = '507f191e810c19729de860ee'.toString();
      const user = {
        id: 'user-123',
        publicMetadata: {
          brand: brandId,
          organization: '507f191e810c19729de860ee'.toString(),
          user: '507f191e810c19729de860ee'.toString(),
        },
      } as never;
      const query = { isDeleted: false } as never;
      const query = controller.buildFindAllQuery(user, query);
      expect(query).toBeInstanceOf(Array);
      expect(query.length).toBeGreaterThan(0);
    });

    it('should include match with correct organization ObjectId', () => {
      const orgId = '507f191e810c19729de860ee'.toString();
      const brandId = '507f191e810c19729de860ee'.toString();
      const user = {
        id: 'user-123',
        publicMetadata: {
          brand: brandId,
          organization: orgId,
          user: '507f191e810c19729de860ee'.toString(),
        },
      } as never;
      const query = { isDeleted: false } as never;
      const query = controller.buildFindAllQuery(user, query);
      const matchStage = query[0] as { match: Record<string, unknown> };
      expect(matchStage.match.brand).toEqual(brandId);
      expect(matchStage.match.organization).toEqual(orgId);
    });

    it('should omit brand match when no brand is selected', () => {
      const orgId = '507f191e810c19729de860ee'.toString();
      const user = {
        id: 'user-123',
        publicMetadata: {
          organization: orgId,
          user: '507f191e810c19729de860ee'.toString(),
        },
      } as never;
      const query = controller.buildFindAllQuery(user, {
        isDeleted: false,
      } as never);
      const matchStage = query[0] as { match: Record<string, unknown> };

      expect(matchStage.match.brand).toBeUndefined();
      expect(matchStage.match.organization).toEqual(orgId);
    });

    it('should include orderBy stage in query', () => {
      const user = {
        id: 'user-123',
        publicMetadata: {
          organization: '507f191e810c19729de860ee'.toString(),
          user: '507f191e810c19729de860ee'.toString(),
        },
      } as never;
      const query = { isDeleted: false } as never;
      const query = controller.buildFindAllQuery(user, query);
      const hasSort = query.some(
        (stage) => 'orderBy' in (stage as Record<string, unknown>),
      );
      expect(hasSort).toBe(true);
    });
  });

  describe('canUserModifyEntity', () => {
    it('should return true when entity organization matches user organization', () => {
      const orgId = '507f191e810c19729de860ee';
      const user = {
        id: 'user-123',
        publicMetadata: {
          organization: orgId.toString(),
          user: '507f191e810c19729de860ee'.toString(),
        },
      } as never;
      const entity = { organization: orgId } as never;
      expect(controller.canUserModifyEntity(user, entity)).toBe(true);
    });

    it('should return false when entity organization does not match', () => {
      const user = {
        id: 'user-123',
        publicMetadata: {
          organization: '507f191e810c19729de860ee'.toString(),
          user: '507f191e810c19729de860ee'.toString(),
        },
      } as never;
      const entity = { organization: '507f191e810c19729de860ee' } as never;
      expect(controller.canUserModifyEntity(user, entity)).toBe(false);
    });
  });
});

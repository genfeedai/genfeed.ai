import { ProactiveOnboardingService } from '@api/endpoints/onboarding/proactive-onboarding.service';
import { ProactiveOnboardingStatus } from '@genfeedai/enums';
import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeLeadModel() {
  const query = () => {
    const q: Record<string, unknown> = {};
    q.exec = vi.fn().mockResolvedValue(null);
    return q;
  };

  return {
    _findOneAndUpdateResult: null as unknown,
    _findOneResult: null as unknown,
    findOne: vi.fn().mockImplementation(function (
      this: ReturnType<typeof makeLeadModel>,
    ) {
      const q: Record<string, unknown> = {};
      q.exec = vi.fn().mockResolvedValue(this._findOneResult);
      return q;
    }),
    findOneAndUpdate: vi.fn().mockImplementation(function (
      this: ReturnType<typeof makeLeadModel>,
    ) {
      const q: Record<string, unknown> = {};
      q.exec = vi.fn().mockResolvedValue(this._findOneAndUpdateResult);
      return q;
    }),
  };
}

const ORG_ID = 'org_abc123';
const LEAD_ID = 'lead_abc123';
const SHADOW_ORG_ID = new Types.ObjectId().toString();
const BRAND_ID = new Types.ObjectId().toString();
const USER_ID = new Types.ObjectId().toString();

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    _id: LEAD_ID,
    company: 'TestCo',
    email: 'test@example.com',
    invitedAt: null,
    name: 'Test User',
    organization: ORG_ID,
    proactiveBatchId: null,
    proactiveBrand: null,
    proactiveOrganization: null,
    proactiveStatus: ProactiveOnboardingStatus.NONE,
    ...overrides,
  };
}

function makeShadowOrg() {
  return {
    _id: new Types.ObjectId(SHADOW_ORG_ID),
    label: 'TestCo',
    user: new Types.ObjectId(USER_ID),
  };
}

// ── Fixture factory ────────────────────────────────────────────────────────

function makeService() {
  const leadModel = makeLeadModel();

  const configService = {
    get: vi.fn((key: string) => {
      if (key === 'GENFEEDAI_APP_URL') {
        return 'https://app.genfeed.ai';
      }

      return undefined;
    }),
  };

  const loggerService = {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const brandScraperService = {
    detectUrlType: vi
      .fn()
      .mockReturnValue({ websiteUrl: 'https://testco.com' }),
    scrapeLinkedIn: vi.fn(),
    scrapeWebsite: vi.fn().mockResolvedValue({
      aboutText: 'About TestCo',
      companyName: 'TestCo',
      description: 'A test company',
      fontFamily: 'sans',
      heroText: undefined,
      logoUrl: undefined,
      metaDescription: 'TestCo meta',
      ogImage: undefined,
      primaryColor: '#fff',
      scrapedAt: new Date(),
      secondaryColor: '#000',
      socialLinks: {},
      sourceUrl: 'https://testco.com',
      tagline: 'We test things',
      valuePropositions: [],
    }),
    scrapeXProfile: vi.fn(),
    validateUrl: vi.fn().mockReturnValue({ isValid: true }),
  };

  const masterPromptGeneratorService = {
    analyzeBrandVoice: vi.fn().mockResolvedValue({
      audience: 'professionals',
      hashtags: ['#testco'],
      taglines: ['We test things'],
      tone: 'professional',
      values: ['quality'],
      voice: 'authoritative',
    }),
    generateMasterPrompts: vi.fn().mockResolvedValue({ short: 'prompt' }),
  };

  const brand = {
    _id: new Types.ObjectId(BRAND_ID),
    description: 'desc',
    label: 'TestCo',
    primaryColor: '#fff',
    secondaryColor: '#000',
  };

  const brandsService = {
    create: vi.fn().mockResolvedValue(brand),
    findOne: vi.fn().mockResolvedValue(brand),
    patch: vi.fn().mockResolvedValue(brand),
  };

  const shadowOrg = makeShadowOrg();

  const organizationsService = {
    create: vi.fn().mockResolvedValue(shadowOrg),
    findOne: vi.fn().mockResolvedValue(shadowOrg),
  };

  const creditsUtilsService = {
    addOrganizationCreditsWithExpiration: vi.fn().mockResolvedValue(undefined),
  };

  const batchGenerationService = {
    createBatch: vi.fn().mockResolvedValue({
      completedItems: 5,
      id: 'batch_1',
      platforms: ['instagram'],
      totalItems: 10,
    }),
    getBatch: vi.fn().mockResolvedValue({
      completedItems: 5,
      id: 'batch_1',
      platforms: ['instagram'],
      totalItems: 10,
    }),
  };

  const clerkService = {
    createInvitation: vi.fn().mockResolvedValue({}),
  };

  const usersService = {
    create: vi.fn().mockResolvedValue({ _id: new Types.ObjectId(USER_ID) }),
  };

  const membersService = {
    create: vi.fn().mockResolvedValue({}),
  };

  const postsService = {
    find: vi.fn().mockResolvedValue([{ _id: 'post_1' }]),
  };

  const service = new (ProactiveOnboardingService as any)(
    leadModel as any,
    loggerService as any,
    brandScraperService as any,
    masterPromptGeneratorService as any,
    brandsService as any,
    organizationsService as any,
    creditsUtilsService as any,
    batchGenerationService as any,
    clerkService as any,
    usersService as any,
    membersService as any,
    postsService as any,
    configService as any,
  );

  return {
    batchGenerationService,
    brandScraperService,
    brandsService,
    clerkService,
    configService,
    creditsUtilsService,
    leadModel,
    loggerService,
    masterPromptGeneratorService,
    membersService,
    organizationsService,
    postsService,
    service,
    usersService,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('ProactiveOnboardingService', () => {
  // ── getLead (via public methods) ──────────────────────────────────────

  describe('lead not found', () => {
    it('throws NotFoundException when lead is missing', async () => {
      const { service, leadModel } = makeService();
      leadModel._findOneResult = null;

      await expect(
        service.getPreparationStatus(LEAD_ID, ORG_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── prepareBrand ──────────────────────────────────────────────────────

  describe('prepareBrand()', () => {
    const dto = { brandName: 'TestCo', brandUrl: 'https://testco.com' };

    it('throws BadRequestException when lead has no email', async () => {
      const { service, leadModel } = makeService();
      leadModel._findOneResult = makeLead({ email: undefined });

      await expect(service.prepareBrand(LEAD_ID, ORG_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for invalid status', async () => {
      const { service, leadModel } = makeService();
      leadModel._findOneResult = makeLead({
        proactiveStatus: ProactiveOnboardingStatus.INVITED,
      });

      await expect(service.prepareBrand(LEAD_ID, ORG_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when URL is invalid', async () => {
      const { service, leadModel, brandScraperService } = makeService();
      leadModel._findOneResult = makeLead();
      brandScraperService.validateUrl.mockReturnValue({
        error: 'bad url',
        isValid: false,
      });

      await expect(service.prepareBrand(LEAD_ID, ORG_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates shadow org and brand for NONE status lead', async () => {
      const {
        service,
        leadModel,
        organizationsService,
        brandsService,
        creditsUtilsService,
      } = makeService();
      leadModel._findOneResult = makeLead();

      const result = await service.prepareBrand(LEAD_ID, ORG_ID, dto);

      expect(result.success).toBe(true);
      expect(result.brandId).toBeDefined();
      expect(organizationsService.create).toHaveBeenCalledOnce();
      expect(brandsService.create).toHaveBeenCalledOnce();
      expect(
        creditsUtilsService.addOrganizationCreditsWithExpiration,
      ).toHaveBeenCalledOnce();
    });

    it('reuses existing shadow org when proactiveOrganization is set (BRAND_READY)', async () => {
      const { service, leadModel, organizationsService, usersService } =
        makeService();
      leadModel._findOneResult = makeLead({
        proactiveOrganization: new Types.ObjectId(SHADOW_ORG_ID),
        proactiveStatus: ProactiveOnboardingStatus.BRAND_READY,
      });

      await service.prepareBrand(LEAD_ID, ORG_ID, dto);

      expect(organizationsService.create).not.toHaveBeenCalled();
      expect(usersService.create).not.toHaveBeenCalled();
    });

    it('writes analyzed brand guidance onto the created brand', async () => {
      const { service, leadModel, brandsService } = makeService();
      leadModel._findOneResult = makeLead();

      await service.prepareBrand(LEAD_ID, ORG_ID, dto);

      expect(brandsService.patch).toHaveBeenCalledOnce();
      const [patchedBrandId, brandPatch] = brandsService.patch.mock.calls[0];
      expect(patchedBrandId).toBe(BRAND_ID);
      expect(brandPatch.agentConfig.voice).toEqual(
        expect.objectContaining({
          audience: ['professionals'],
          hashtags: ['#testco'],
          style: 'authoritative',
          taglines: ['We test things'],
          tone: 'professional',
          values: ['quality'],
        }),
      );
    });

    it('reverts status to NONE and throws HttpException on unexpected error', async () => {
      const { service, leadModel, brandsService, loggerService } =
        makeService();
      leadModel._findOneResult = makeLead();
      brandsService.create.mockRejectedValue(new Error('DB exploded'));

      await expect(service.prepareBrand(LEAD_ID, ORG_ID, dto)).rejects.toThrow(
        HttpException,
      );
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('re-throws HttpException directly without wrapping', async () => {
      const { service, leadModel, brandsService } = makeService();
      leadModel._findOneResult = makeLead();
      const originalError = new HttpException('upstream error', 502);
      brandsService.create.mockRejectedValue(originalError);

      const thrown = await service
        .prepareBrand(LEAD_ID, ORG_ID, dto)
        .catch((e) => e);
      expect(thrown).toBe(originalError);
    });

    it('passes industry and targetAudience into brand system prompt', async () => {
      const { service, leadModel, brandsService } = makeService();
      leadModel._findOneResult = makeLead();

      await service.prepareBrand(LEAD_ID, ORG_ID, {
        brandUrl: 'https://testco.com',
        industry: 'SaaS',
        targetAudience: 'Developers',
      });

      const brandArgs = brandsService.create.mock.calls[0][0];
      expect(brandArgs.text).toContain('SaaS');
      expect(brandArgs.text).toContain('Developers');
    });
  });

  // ── generateContent ───────────────────────────────────────────────────

  describe('generateContent()', () => {
    const dto = { count: 5, platforms: ['instagram'] as string[] };

    it('throws BadRequestException when status is not BRAND_READY', async () => {
      const { service, leadModel } = makeService();
      leadModel._findOneResult = makeLead({
        proactiveStatus: ProactiveOnboardingStatus.NONE,
      });

      await expect(
        service.generateContent(LEAD_ID, ORG_ID, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when shadow org or brand missing', async () => {
      const { service, leadModel } = makeService();
      leadModel._findOneResult = makeLead({
        proactiveBrand: null,
        proactiveOrganization: null,
        proactiveStatus: ProactiveOnboardingStatus.BRAND_READY,
      });

      await expect(
        service.generateContent(LEAD_ID, ORG_ID, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates batch and returns batchId on success', async () => {
      const { service, leadModel, batchGenerationService } = makeService();
      leadModel._findOneResult = makeLead({
        proactiveBrand: new Types.ObjectId(BRAND_ID),
        proactiveOrganization: new Types.ObjectId(SHADOW_ORG_ID),
        proactiveStatus: ProactiveOnboardingStatus.BRAND_READY,
      });

      const result = await service.generateContent(LEAD_ID, ORG_ID, dto);

      expect(result.success).toBe(true);
      expect(result.batchId).toBe('batch_1');
      expect(batchGenerationService.createBatch).toHaveBeenCalledOnce();
    });

    it('passes correct count and platforms to createBatch', async () => {
      const { service, leadModel, batchGenerationService } = makeService();
      leadModel._findOneResult = makeLead({
        proactiveBrand: new Types.ObjectId(BRAND_ID),
        proactiveOrganization: new Types.ObjectId(SHADOW_ORG_ID),
        proactiveStatus: ProactiveOnboardingStatus.BRAND_READY,
      });

      await service.generateContent(LEAD_ID, ORG_ID, {
        count: 7,
        platforms: ['twitter'],
      });

      const [batchDto] = batchGenerationService.createBatch.mock.calls[0];
      expect(batchDto.count).toBe(7);
      expect(batchDto.platforms).toEqual(['twitter']);
    });

    it('defaults to 10 posts when count not specified', async () => {
      const { service, leadModel, batchGenerationService } = makeService();
      leadModel._findOneResult = makeLead({
        proactiveBrand: new Types.ObjectId(BRAND_ID),
        proactiveOrganization: new Types.ObjectId(SHADOW_ORG_ID),
        proactiveStatus: ProactiveOnboardingStatus.BRAND_READY,
      });

      await service.generateContent(LEAD_ID, ORG_ID, {});

      const [batchDto] = batchGenerationService.createBatch.mock.calls[0];
      expect(batchDto.count).toBe(10);
    });

    it('reverts to BRAND_READY on failure', async () => {
      const { service, leadModel, batchGenerationService, loggerService } =
        makeService();
      leadModel._findOneResult = makeLead({
        proactiveBrand: new Types.ObjectId(BRAND_ID),
        proactiveOrganization: new Types.ObjectId(SHADOW_ORG_ID),
        proactiveStatus: ProactiveOnboardingStatus.BRAND_READY,
      });
      batchGenerationService.createBatch.mockRejectedValue(
        new Error('batch fail'),
      );

      await expect(
        service.generateContent(LEAD_ID, ORG_ID, dto),
      ).rejects.toThrow(HttpException);
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  // ── sendInvitation ────────────────────────────────────────────────────

  describe('sendInvitation()', () => {
    const dto = {};

    it('throws BadRequestException when lead has no email', async () => {
      const { service, leadModel } = makeService();
      leadModel._findOneResult = makeLead({
        email: undefined,
        proactiveOrganization: new Types.ObjectId(SHADOW_ORG_ID),
        proactiveStatus: ProactiveOnboardingStatus.CONTENT_READY,
      });

      await expect(
        service.sendInvitation(LEAD_ID, ORG_ID, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for wrong status', async () => {
      const { service, leadModel } = makeService();
      leadModel._findOneResult = makeLead({
        proactiveOrganization: new Types.ObjectId(SHADOW_ORG_ID),
        proactiveStatus: ProactiveOnboardingStatus.BRAND_READY,
      });

      await expect(
        service.sendInvitation(LEAD_ID, ORG_ID, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when shadow org missing', async () => {
      const { service, leadModel } = makeService();
      leadModel._findOneResult = makeLead({
        proactiveOrganization: null,
        proactiveStatus: ProactiveOnboardingStatus.CONTENT_READY,
      });

      await expect(
        service.sendInvitation(LEAD_ID, ORG_ID, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('calls clerkService.createInvitation with lead email', async () => {
      const { service, leadModel, clerkService } = makeService();
      leadModel._findOneResult = makeLead({
        proactiveOrganization: new Types.ObjectId(SHADOW_ORG_ID),
        proactiveStatus: ProactiveOnboardingStatus.READY,
      });

      const result = await service.sendInvitation(LEAD_ID, ORG_ID, dto);

      expect(result.success).toBe(true);
      expect(result.invitedAt).toBeInstanceOf(Date);
      expect(clerkService.createInvitation).toHaveBeenCalledWith(
        'test@example.com',
        'https://app.genfeed.ai/onboarding/proactive',
        expect.objectContaining({
          isProactiveOnboarding: true,
          leadId: LEAD_ID,
        }),
      );
    });

    it('allows re-sending invitation when status is already INVITED', async () => {
      const { service, leadModel, clerkService } = makeService();
      leadModel._findOneResult = makeLead({
        proactiveOrganization: new Types.ObjectId(SHADOW_ORG_ID),
        proactiveStatus: ProactiveOnboardingStatus.INVITED,
      });

      await service.sendInvitation(LEAD_ID, ORG_ID, dto);

      expect(clerkService.createInvitation).toHaveBeenCalledOnce();
    });

    it('throws HttpException wrapping non-HTTP errors', async () => {
      const { service, leadModel, clerkService } = makeService();
      leadModel._findOneResult = makeLead({
        proactiveOrganization: new Types.ObjectId(SHADOW_ORG_ID),
        proactiveStatus: ProactiveOnboardingStatus.CONTENT_READY,
      });
      clerkService.createInvitation.mockRejectedValue(new Error('Clerk down'));

      await expect(
        service.sendInvitation(LEAD_ID, ORG_ID, dto),
      ).rejects.toThrow(HttpException);
    });
  });

  // ── getPreparationStatus ──────────────────────────────────────────────

  describe('getPreparationStatus()', () => {
    it('returns minimal status for lead with no proactive data', async () => {
      const { service, leadModel } = makeService();
      leadModel._findOneResult = makeLead();

      const status = await service.getPreparationStatus(LEAD_ID, ORG_ID);

      expect(status.proactiveStatus).toBe(ProactiveOnboardingStatus.NONE);
      expect(status.brand).toBeUndefined();
      expect(status.batch).toBeUndefined();
      expect(status.invitation).toBeUndefined();
    });

    it('includes brand info when proactiveBrand is set', async () => {
      const { service, leadModel, brandsService } = makeService();
      leadModel._findOneResult = makeLead({
        proactiveBrand: new Types.ObjectId(BRAND_ID),
        proactiveStatus: ProactiveOnboardingStatus.BRAND_READY,
      });

      const status = await service.getPreparationStatus(LEAD_ID, ORG_ID);

      expect(status.brand).toBeDefined();
      expect(status.brand?.id).toBeDefined();
      expect(brandsService.findOne).toHaveBeenCalledOnce();
    });

    it('includes batch info when proactiveBatchId is set', async () => {
      const { service, leadModel } = makeService();
      leadModel._findOneResult = makeLead({
        proactiveBatchId: 'batch_1',
        proactiveOrganization: new Types.ObjectId(SHADOW_ORG_ID),
        proactiveStatus: ProactiveOnboardingStatus.CONTENT_READY,
      });

      const status = await service.getPreparationStatus(LEAD_ID, ORG_ID);

      expect(status.batch).toBeDefined();
      expect(status.batch?.id).toBe('batch_1');
      expect(status.batch?.totalPosts).toBe(10);
    });

    it('includes invitation info when invitedAt and email are set', async () => {
      const { service, leadModel } = makeService();
      const invitedAt = new Date('2024-01-01T00:00:00Z');
      leadModel._findOneResult = makeLead({
        invitedAt,
        proactiveStatus: ProactiveOnboardingStatus.INVITED,
      });

      const status = await service.getPreparationStatus(LEAD_ID, ORG_ID);

      expect(status.invitation).toBeDefined();
      expect(status.invitation?.email).toBe('test@example.com');
      expect(status.invitation?.invitedAt).toBe(invitedAt.toISOString());
    });

    it('includes readiness metrics when outputs are ready to invite', async () => {
      const { service, leadModel } = makeService();
      leadModel._findOneResult = makeLead({
        proactiveBatchId: 'batch_1',
        proactiveOrganization: new Types.ObjectId(SHADOW_ORG_ID),
        proactiveStatus: ProactiveOnboardingStatus.READY,
      });

      const status = await service.getPreparationStatus(LEAD_ID, ORG_ID);

      expect(status.inviteEligible).toBe(true);
      expect(status.generatedAssetCount).toBe(5);
      expect(status.prepPercent).toBe(100);
      expect(status.prepStage).toBe('ready');
    });

    it('includes organization info when proactiveOrganization is set', async () => {
      const { service, leadModel } = makeService();
      leadModel._findOneResult = makeLead({
        proactiveOrganization: new Types.ObjectId(SHADOW_ORG_ID),
        proactiveStatus: ProactiveOnboardingStatus.BRAND_READY,
      });

      const status = await service.getPreparationStatus(LEAD_ID, ORG_ID);

      expect(status.organization).toBeDefined();
      expect(status.organization?.label).toBe('TestCo');
    });

    it('handles getBatch errors gracefully (no throw)', async () => {
      const { service, leadModel, batchGenerationService } = makeService();
      leadModel._findOneResult = makeLead({
        proactiveBatchId: 'batch_err',
        proactiveOrganization: new Types.ObjectId(SHADOW_ORG_ID),
        proactiveStatus: ProactiveOnboardingStatus.CONTENT_READY,
      });
      batchGenerationService.getBatch.mockRejectedValue(new Error('not found'));

      const status = await service.getPreparationStatus(LEAD_ID, ORG_ID);

      expect(status.batch).toBeUndefined();
    });
  });

  // ── reviewContent ─────────────────────────────────────────────────────

  describe('reviewContent()', () => {
    it('returns empty posts when no shadow org', async () => {
      const { service, leadModel } = makeService();
      leadModel._findOneResult = makeLead({ proactiveOrganization: null });

      const result = await service.reviewContent(LEAD_ID, ORG_ID);

      expect(result.posts).toEqual([]);
    });

    it('returns posts from shadow org', async () => {
      const { service, leadModel, postsService } = makeService();
      leadModel._findOneResult = makeLead({
        proactiveOrganization: new Types.ObjectId(SHADOW_ORG_ID),
      });

      const result = await service.reviewContent(LEAD_ID, ORG_ID);

      expect(result.posts).toHaveLength(1);
      expect(postsService.find).toHaveBeenCalledWith(
        expect.objectContaining({ isDeleted: false }),
      );
    });
  });

  describe('claimWorkspace()', () => {
    it('marks an invited lead as started and returns prepared outputs', async () => {
      const { service, leadModel } = makeService();
      leadModel._findOneResult = makeLead({
        proactiveBatchId: 'batch_1',
        proactiveBrand: new Types.ObjectId(BRAND_ID),
        proactiveOrganization: new Types.ObjectId(SHADOW_ORG_ID),
        proactiveStatus: ProactiveOnboardingStatus.INVITED,
      });

      const result = await (service as any).claimWorkspace(
        SHADOW_ORG_ID,
        USER_ID,
      );

      expect(result.success).toBe(true);
      expect(result.proactiveStatus).toBe(ProactiveOnboardingStatus.STARTED);
      expect(result.outputs).toHaveLength(1);
      expect(leadModel.findOneAndUpdate).toHaveBeenCalled();
    });
  });

  describe('markPaymentMade()', () => {
    it('marks the claimed shadow org as payment made', async () => {
      const { service, leadModel } = makeService();
      leadModel._findOneResult = makeLead({
        proactiveOrganization: SHADOW_ORG_ID,
        proactiveStatus: ProactiveOnboardingStatus.STARTED,
      });

      await (service as any).markPaymentMade(SHADOW_ORG_ID);

      expect(leadModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: LEAD_ID,
          isDeleted: false,
          organization: ORG_ID,
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            paymentMadeAt: expect.any(Date),
            proactiveStatus: ProactiveOnboardingStatus.PAYMENT_MADE,
          }),
        }),
      );
    });
  });
});

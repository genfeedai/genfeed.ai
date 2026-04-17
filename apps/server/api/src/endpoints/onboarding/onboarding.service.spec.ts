import { HttpException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers / value objects
// ---------------------------------------------------------------------------

const makeObjectId = () => '507f191e810c19729de860ee';

const mockUser = (orgId: string, userId: string) =>
  ({
    id: 'clerk_user_123',
    publicMetadata: { organization: orgId, user: userId },
  }) as any;

// ---------------------------------------------------------------------------
// Mock factories — every dependency the constructor injects
// ---------------------------------------------------------------------------

const makeMocks = () => ({
  accessBootstrapCacheService: {
    invalidateForUser: vi.fn(),
  },
  brandScraperService: {
    detectUrlType: vi.fn(),
    scrapeAllSources: vi.fn(),
    scrapeLinkedIn: vi.fn(),
    scrapeWebsite: vi.fn(),
    scrapeXProfile: vi.fn(),
    validateUrl: vi.fn(),
  },
  brandsService: {
    findOne: vi.fn(),
    patch: vi.fn(),
    patchAll: vi.fn(),
    selectBrandForUser: vi.fn(),
  },
  clerkService: { updateUserPublicMetadata: vi.fn() },
  comfyUIService: { generateImage: vi.fn() },
  creditsUtilsService: {
    addOrganizationCreditsWithExpiration: vi.fn(),
    checkOrganizationCreditsAvailable: vi.fn(),
    deductCreditsFromOrganization: vi.fn(),
  },
  filesClientService: {
    getPresignedUploadUrl: vi.fn(),
    uploadToS3: vi.fn(),
  },
  linksService: {
    create: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
  },
  loggerService: { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
  masterPromptGeneratorService: {
    analyzeBrandVoice: vi.fn(),
    generateMasterPrompts: vi.fn(),
  },
  organizationSettingsService: {
    findOne: vi.fn(),
    normalizeJourneyState: vi.fn(() => [
      {
        completedAt: null,
        id: 'complete_company_info',
        isCompleted: false,
        rewardClaimed: false,
        rewardCredits: 10,
      },
    ]),
    patch: vi.fn(),
  },
  organizationsService: {
    findOne: vi.fn(),
    generateUniqueSlug: vi.fn(),
    patch: vi.fn(),
  },
  proactiveOnboardingService: {
    claimWorkspace: vi.fn(),
    getWorkspaceSummary: vi.fn(),
    markPaymentMade: vi.fn(),
  },
  requestContextCacheService: {
    invalidateForUser: vi.fn(),
  },
  usersService: { findOne: vi.fn(), patch: vi.fn() },
});

// ---------------------------------------------------------------------------
// Import the real service AFTER mocks are wired up
// (No module-level auto-mocking — we pass mocks directly in constructor)
// ---------------------------------------------------------------------------

import { OnboardingService } from '@api/endpoints/onboarding/onboarding.service';
import { OrganizationCategory } from '@genfeedai/enums';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('OnboardingService', () => {
  let service: OnboardingService;
  let mocks: ReturnType<typeof makeMocks>;

  const orgId = makeObjectId().toString();
  const userId = makeObjectId().toString();
  const user = mockUser(orgId, userId);

  beforeEach(() => {
    mocks = makeMocks();
    service = new OnboardingService(
      mocks.loggerService as any,
      mocks.brandScraperService as any,
      mocks.masterPromptGeneratorService as any,
      mocks.brandsService as any,
      mocks.comfyUIService as any,
      mocks.creditsUtilsService as any,
      mocks.filesClientService as any,
      mocks.linksService as any,
      mocks.organizationSettingsService as any,
      mocks.organizationsService as any,
      mocks.clerkService as any,
      mocks.usersService as any,
      mocks.proactiveOnboardingService as any,
      mocks.requestContextCacheService as any,
      mocks.accessBootstrapCacheService as any,
    );
  });

  // =========================================================================
  // setAccountType
  // =========================================================================

  describe('setAccountType', () => {
    it('updates org and Clerk metadata, returns success', async () => {
      mocks.organizationsService.patch.mockResolvedValue(undefined);
      mocks.clerkService.updateUserPublicMetadata.mockResolvedValue(undefined);

      const result = await service.setAccountType(
        user,
        OrganizationCategory.BRAND,
      );

      expect(mocks.organizationsService.patch).toHaveBeenCalledWith(
        expect.any(String),
        {
          accountType: OrganizationCategory.BRAND,
          category: OrganizationCategory.BRAND,
        },
      );
      expect(mocks.clerkService.updateUserPublicMetadata).toHaveBeenCalledWith(
        'clerk_user_123',
        expect.objectContaining({ category: OrganizationCategory.BRAND }),
      );
      expect(result).toMatchObject({ success: true });
    });

    it('throws 500 when org patch fails', async () => {
      mocks.organizationsService.patch.mockRejectedValue(new Error('DB error'));

      await expect(
        service.setAccountType(user, OrganizationCategory.BRAND),
      ).rejects.toMatchObject({ status: HttpStatus.INTERNAL_SERVER_ERROR });
    });

    it('re-throws HttpException as-is', async () => {
      const ex = new HttpException('Forbidden', HttpStatus.FORBIDDEN);
      mocks.organizationsService.patch.mockRejectedValue(ex);

      await expect(
        service.setAccountType(user, OrganizationCategory.BRAND),
      ).rejects.toThrow(ex);
    });
  });

  // =========================================================================
  // skipOnboarding
  // =========================================================================

  describe('skipOnboarding', () => {
    it('marks onboarding complete and returns success', async () => {
      const settings = { _id: makeObjectId(), isFirstLogin: true };
      mocks.organizationSettingsService.findOne.mockResolvedValue(settings);
      mocks.organizationSettingsService.patch.mockResolvedValue(undefined);

      const result = await service.skipOnboarding(user);

      expect(mocks.organizationSettingsService.patch).toHaveBeenCalledWith(
        settings._id,
        { isFirstLogin: false },
      );
      expect(result.success).toBe(true);
    });

    it('throws 500 on unexpected error', async () => {
      mocks.organizationSettingsService.findOne.mockRejectedValue(
        new Error('fail'),
      );

      await expect(service.skipOnboarding(user)).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    });
  });

  // =========================================================================
  // getOnboardingStatus
  // =========================================================================

  describe('getOnboardingStatus', () => {
    it('returns isFirstLogin true when settings missing', async () => {
      mocks.organizationSettingsService.findOne.mockResolvedValue(null);

      const result = await service.getOnboardingStatus(user);

      expect(result).toEqual({
        hasCompletedOnboarding: false,
        isFirstLogin: true,
      });
    });

    it('returns hasCompletedOnboarding true when isFirstLogin is false', async () => {
      mocks.organizationSettingsService.findOne.mockResolvedValue({
        isFirstLogin: false,
      });

      const result = await service.getOnboardingStatus(user);

      expect(result).toEqual({
        hasCompletedOnboarding: true,
        isFirstLogin: false,
      });
    });
  });

  // =========================================================================
  // completeFunnel
  // =========================================================================

  describe('completeFunnel', () => {
    it('marks Clerk and DB user as onboarding completed', async () => {
      const dbUser = { _id: makeObjectId(), isOnboardingCompleted: false };
      mocks.usersService.findOne.mockResolvedValue(dbUser);
      mocks.usersService.patch.mockResolvedValue(undefined);
      mocks.clerkService.updateUserPublicMetadata.mockResolvedValue(undefined);
      mocks.proactiveOnboardingService.markPaymentMade.mockResolvedValue({
        paymentMadeAt: new Date(),
        success: true,
      });

      const result = await service.completeFunnel(user);

      expect(mocks.clerkService.updateUserPublicMetadata).toHaveBeenCalledWith(
        'clerk_user_123',
        { isOnboardingCompleted: true },
      );
      expect(mocks.usersService.patch).toHaveBeenCalledWith(
        dbUser._id,
        expect.objectContaining({ isOnboardingCompleted: true }),
      );
      expect(result.success).toBe(true);
    });

    it('marks proactive onboarding as payment made before completing funnel', async () => {
      const proactiveUser = {
        ...user,
        publicMetadata: {
          organization: orgId,
          proactiveLeadId: 'lead_123',
          user: userId,
        },
      };
      mocks.usersService.findOne.mockResolvedValue({
        _id: makeObjectId(),
        isOnboardingCompleted: false,
      });
      mocks.usersService.patch.mockResolvedValue(undefined);
      mocks.clerkService.updateUserPublicMetadata.mockResolvedValue(undefined);
      mocks.proactiveOnboardingService.markPaymentMade.mockResolvedValue({
        paymentMadeAt: new Date(),
        success: true,
      });

      await service.completeFunnel(proactiveUser as any);

      expect(
        mocks.proactiveOnboardingService.markPaymentMade,
      ).toHaveBeenCalledWith('lead_123', orgId);
    });

    it('skips DB patch when user already onboarded', async () => {
      mocks.usersService.findOne.mockResolvedValue({
        _id: makeObjectId(),
        isOnboardingCompleted: true,
      });
      mocks.clerkService.updateUserPublicMetadata.mockResolvedValue(undefined);

      await service.completeFunnel(user);

      expect(mocks.usersService.patch).not.toHaveBeenCalled();
    });

    it('throws 500 on Clerk failure', async () => {
      mocks.clerkService.updateUserPublicMetadata.mockRejectedValue(
        new Error('clerk fail'),
      );

      await expect(service.completeFunnel(user)).rejects.toMatchObject({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    });
  });

  // =========================================================================
  // proactive workspace
  // =========================================================================

  describe('getProactiveWorkspace', () => {
    it('returns the proactive workspace summary for invited users', async () => {
      const proactiveUser = {
        ...user,
        publicMetadata: {
          organization: orgId,
          proactiveLeadId: 'lead_123',
          user: userId,
        },
      };
      const mockSummary = {
        outputs: [{ _id: 'post_1' }],
        proactiveStatus: 'invited',
        success: true,
      };
      mocks.proactiveOnboardingService.getWorkspaceSummary.mockResolvedValue(
        mockSummary,
      );

      const result = await service.getProactiveWorkspace(proactiveUser as any);

      expect(
        mocks.proactiveOnboardingService.getWorkspaceSummary,
      ).toHaveBeenCalledWith('lead_123', orgId);
      expect(result).toEqual(mockSummary);
    });
  });

  describe('claimProactiveWorkspace', () => {
    it('claims a proactive workspace using the current user context', async () => {
      const proactiveUser = {
        ...user,
        publicMetadata: {
          organization: orgId,
          proactiveLeadId: 'lead_123',
          user: userId,
        },
      };
      const claimedWorkspace = {
        outputs: [{ _id: 'post_1' }],
        proactiveStatus: 'started',
        success: true,
      };
      mocks.proactiveOnboardingService.claimWorkspace.mockResolvedValue(
        claimedWorkspace,
      );

      const result = await service.claimProactiveWorkspace(
        proactiveUser as any,
      );

      expect(
        mocks.proactiveOnboardingService.claimWorkspace,
      ).toHaveBeenCalledWith('lead_123', orgId, userId);
      expect(result).toEqual(claimedWorkspace);
    });

    it('throws 400 when proactive lead metadata is missing', async () => {
      await expect(service.claimProactiveWorkspace(user)).rejects.toMatchObject(
        {
          status: HttpStatus.BAD_REQUEST,
        },
      );
    });
  });

  // =========================================================================
  // updateBrandName
  // =========================================================================

  describe('updateBrandName', () => {
    it('patches brand and org label', async () => {
      const brand = { _id: makeObjectId() };
      mocks.brandsService.findOne.mockResolvedValue(brand);
      mocks.brandsService.patch.mockResolvedValue(undefined);
      mocks.organizationsService.generateUniqueSlug.mockResolvedValue('acme');
      mocks.organizationsService.patch.mockResolvedValue(undefined);

      const result = await service.updateBrandName({ brandName: 'Acme' }, user);

      expect(mocks.brandsService.patch).toHaveBeenCalledWith(brand._id, {
        label: 'Acme',
      });
      expect(mocks.organizationsService.patch).toHaveBeenCalledWith(
        expect.any(String),
        { label: 'Acme', slug: 'acme' },
      );
      expect(result.success).toBe(true);
    });

    it('throws 404 when no brand found', async () => {
      mocks.brandsService.findOne.mockResolvedValue(null);

      await expect(
        service.updateBrandName({ brandName: 'Acme' }, user),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });
  });

  // =========================================================================
  // addReferenceImages
  // =========================================================================

  describe('addReferenceImages', () => {
    it('pushes images to brand and returns count', async () => {
      const brand = { _id: makeObjectId() };
      mocks.brandsService.findOne.mockResolvedValue(brand);
      mocks.brandsService.patchAll.mockResolvedValue(undefined);

      const images = [
        { url: 'https://img1.png' },
        { url: 'https://img2.png' },
      ] as any;
      const result = await service.addReferenceImages(
        brand._id.toString(),
        images,
        user,
      );

      expect(mocks.brandsService.patchAll).toHaveBeenCalledWith(
        { _id: brand._id },
        { $push: { referenceImages: { $each: images } } },
      );
      expect(result).toEqual({ count: 2, success: true });
    });

    it('throws 404 when brand not found', async () => {
      mocks.brandsService.findOne.mockResolvedValue(null);

      await expect(
        service.addReferenceImages(makeObjectId().toString(), [], user),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });
  });

  // =========================================================================
  // generateOnboardingPreview
  // =========================================================================

  describe('generateOnboardingPreview', () => {
    const brandId = makeObjectId().toString();
    const dto = { brandId, contentType: 'social' } as any;

    it('generates image, uploads and deducts credits', async () => {
      const brand = {
        _id: makeObjectId(),
        description: 'Cool brand',
        label: 'Acme',
        primaryColor: '#fff',
        secondaryColor: '#000',
      };
      mocks.brandsService.findOne.mockResolvedValue(brand);
      mocks.creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
        true,
      );
      mocks.comfyUIService.generateImage.mockResolvedValue({
        imageBuffer: Buffer.from('img'),
      });
      mocks.filesClientService.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: 'https://s3.example.com/preview.png',
      });
      mocks.filesClientService.uploadToS3.mockResolvedValue(undefined);
      mocks.creditsUtilsService.deductCreditsFromOrganization.mockResolvedValue(
        undefined,
      );
      mocks.brandsService.patch.mockResolvedValue(undefined);

      const result = await service.generateOnboardingPreview(dto, user);

      expect(result.imageUrl).toBe('https://s3.example.com/preview.png');
      expect(
        mocks.creditsUtilsService.deductCreditsFromOrganization,
      ).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        5,
        expect.any(String),
      );
    });

    it('throws 402 when insufficient credits', async () => {
      mocks.brandsService.findOne.mockResolvedValue({ _id: makeObjectId() });
      mocks.creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
        false,
      );

      await expect(
        service.generateOnboardingPreview(dto, user),
      ).rejects.toMatchObject({
        status: HttpStatus.PAYMENT_REQUIRED,
      });
    });

    it('throws 404 when brand not found', async () => {
      mocks.brandsService.findOne.mockResolvedValue(null);

      await expect(
        service.generateOnboardingPreview(dto, user),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('throws 400 when org/user context missing', async () => {
      const noContextUser = { id: 'u', publicMetadata: {} } as any;

      await expect(
        service.generateOnboardingPreview(dto, noContextUser),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('builds ads prompt correctly', async () => {
      const adsDto = { brandId, contentType: 'ads' } as any;
      const brand = {
        _id: makeObjectId(),
        description: 'Cool',
        label: 'Acme',
        primaryColor: '#f00',
        secondaryColor: '#0f0',
      };
      mocks.brandsService.findOne.mockResolvedValue(brand);
      mocks.creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
        true,
      );
      mocks.comfyUIService.generateImage.mockResolvedValue({
        imageBuffer: Buffer.from('img'),
      });
      mocks.filesClientService.getPresignedUploadUrl.mockResolvedValue({
        publicUrl: 'https://url',
      });
      mocks.filesClientService.uploadToS3.mockResolvedValue(undefined);
      mocks.creditsUtilsService.deductCreditsFromOrganization.mockResolvedValue(
        undefined,
      );
      mocks.brandsService.patch.mockResolvedValue(undefined);

      const result = await service.generateOnboardingPreview(adsDto, user);

      expect(result.prompt).toContain('advertisement');
    });
  });

  describe('getInstallReadiness', () => {
    it('returns local tool readiness alongside provider readiness', async () => {
      mocks.organizationsService.findOne.mockResolvedValue({
        _id: makeObjectId(),
      });
      mocks.brandsService.findOne.mockResolvedValue({ _id: makeObjectId() });

      vi.spyOn(service as any, 'getLocalToolReadiness').mockReturnValue({
        anyDetected: true,
        claude: true,
        codex: false,
        detected: ['claude'],
      });
      vi.spyOn(service as any, 'getProviderReadiness').mockReturnValue({
        anyConfigured: true,
        configured: ['replicate'],
        fal: false,
        imageGenerationReady: true,
        openai: false,
        replicate: true,
        textGenerationReady: false,
      });

      const result = await service.getInstallReadiness(user);

      expect(result.localTools).toEqual({
        anyDetected: true,
        claude: true,
        codex: false,
        detected: ['claude'],
      });
      expect(result.providers.configured).toEqual(['replicate']);
      expect(result.workspace.hasBrand).toBe(true);
      expect(result.workspace.hasOrganization).toBe(true);
    });
  });

  // =========================================================================
  // setupBrand
  // =========================================================================

  describe('setupBrand', () => {
    const brandId = makeObjectId();
    const existingBrand = { _id: brandId };

    const scrapedData = {
      aboutText: 'About Acme',
      companyName: 'Acme',
      description: 'We build stuff',
      fontFamily: 'Arial',
      heroText: undefined,
      logoUrl: 'https://logo.png',
      metaDescription: undefined,
      ogImage: undefined,
      primaryColor: '#f00',
      scrapedAt: new Date(),
      secondaryColor: '#0f0',
      socialLinks: {},
      sourceUrl: 'https://acme.com',
      tagline: 'Build fast',
      valuePropositions: [],
    };

    const brandVoice = {
      audience: 'devs',
      doNotSoundLike: ['corporate jargon'],
      hashtags: [],
      messagingPillars: ['clarity', 'proof'],
      sampleOutput: 'Ship the clearest version first.',
      taglines: [],
      tone: 'bold',
      values: [],
      voice: 'professional',
    };
    function setupHappyPath() {
      mocks.brandScraperService.validateUrl.mockReturnValue({ isValid: true });
      mocks.brandsService.findOne.mockResolvedValue(existingBrand);
      mocks.brandScraperService.detectUrlType.mockReturnValue({
        websiteUrl: 'https://acme.com',
      });
      mocks.brandScraperService.scrapeWebsite.mockResolvedValue(scrapedData);
      mocks.masterPromptGeneratorService.analyzeBrandVoice.mockResolvedValue(
        brandVoice,
      );
      mocks.organizationsService.generateUniqueSlug.mockResolvedValue('acme');
      mocks.brandsService.patch.mockResolvedValue(undefined);
      mocks.organizationsService.patch.mockResolvedValue(undefined);
      mocks.organizationSettingsService.findOne.mockResolvedValue({
        _id: makeObjectId(),
        isFirstLogin: true,
      });
      mocks.organizationSettingsService.patch.mockResolvedValue(undefined);
    }

    it('runs full happy path and returns brandId', async () => {
      setupHappyPath();

      const result = await service.setupBrand(
        { brandUrl: 'https://acme.com' } as any,
        user,
      );

      expect(result.success).toBe(true);
      expect(result.brandId).toBe(brandId.toString());
      expect(mocks.brandsService.patch).toHaveBeenCalled();
    });

    it('prefers the current brand from Clerk metadata before fallback lookup', async () => {
      setupHappyPath();
      const metadataBrandId = makeObjectId();
      const metadataUser = {
        ...user,
        publicMetadata: {
          ...user.publicMetadata,
          brand: metadataBrandId.toString(),
        },
      };
      const metadataBrand = { _id: metadataBrandId };

      mocks.brandsService.findOne.mockReset();
      mocks.brandsService.findOne.mockResolvedValue(metadataBrand);

      const result = await service.setupBrand(
        { brandUrl: 'https://acme.com' } as any,
        metadataUser,
      );

      expect(result.brandId).toBe(metadataBrandId.toString());
      expect(mocks.brandsService.findOne).toHaveBeenCalledWith(
        {
          _id: metadataBrandId,
          isDeleted: false,
          organization: expect.any(String),
          user: expect.any(String),
        },
        'none',
      );
    });

    it('reuses an existing same-label brand in the organization instead of colliding on unique label index', async () => {
      setupHappyPath();
      const duplicateBrandId = makeObjectId();
      const duplicateBrand = {
        _id: duplicateBrandId,
        isSelected: false,
        label: 'Genfeed',
      };

      mocks.brandsService.findOne.mockReset();
      mocks.brandsService.findOne
        .mockResolvedValueOnce(existingBrand)
        .mockResolvedValueOnce(duplicateBrand);
      mocks.brandsService.selectBrandForUser.mockResolvedValue(duplicateBrand);
      mocks.clerkService.updateUserPublicMetadata.mockResolvedValue(undefined);

      const result = await service.setupBrand(
        { brandUrl: 'https://acme.com' } as any,
        user,
      );

      expect(result.brandId).toBe(duplicateBrandId.toString());
      expect(mocks.brandsService.selectBrandForUser).toHaveBeenCalledWith(
        duplicateBrandId.toString(),
        userId,
        orgId,
      );
      expect(mocks.clerkService.updateUserPublicMetadata).toHaveBeenCalledWith(
        'clerk_user_123',
        { brand: duplicateBrandId.toString() },
      );
      expect(mocks.brandsService.patch).toHaveBeenCalledWith(
        duplicateBrandId,
        expect.any(Object),
      );
    });

    it('throws 400 on invalid URL', async () => {
      mocks.brandScraperService.validateUrl.mockReturnValue({
        error: 'bad url',
        isValid: false,
      });

      await expect(
        service.setupBrand({ brandUrl: 'not-a-url' } as any, user),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
      });
    });

    it('throws 404 when brand does not exist for user', async () => {
      mocks.brandScraperService.validateUrl.mockReturnValue({ isValid: true });
      mocks.brandsService.findOne.mockResolvedValue(null);

      await expect(
        service.setupBrand({ brandUrl: 'https://acme.com' } as any, user),
      ).rejects.toMatchObject({
        status: HttpStatus.NOT_FOUND,
      });
    });

    it('writes analyzed brand voice into brand agentConfig', async () => {
      setupHappyPath();

      await service.setupBrand({ brandUrl: 'https://acme.com' } as any, user);

      expect(mocks.brandsService.patch).toHaveBeenCalledWith(
        brandId,
        expect.objectContaining({
          agentConfig: expect.objectContaining({
            voice: expect.objectContaining({
              audience: ['devs'],
              doNotSoundLike: ['corporate jargon'],
              messagingPillars: ['clarity', 'proof'],
              sampleOutput: 'Ship the clearest version first.',
              style: 'professional',
              tone: 'bold',
            }),
          }),
        }),
      );
    });

    it('falls back to minimal brand setup when scraping fails', async () => {
      mocks.brandScraperService.validateUrl.mockReturnValue({ isValid: true });
      mocks.brandsService.findOne.mockResolvedValue(existingBrand);
      mocks.brandScraperService.detectUrlType.mockReturnValue({
        websiteUrl: 'https://acme.com',
      });
      mocks.brandScraperService.scrapeWebsite.mockRejectedValue(
        new Error('network down'),
      );
      mocks.brandsService.patch.mockResolvedValue(undefined);
      mocks.organizationsService.generateUniqueSlug.mockResolvedValue('brand');
      mocks.organizationsService.patch.mockResolvedValue(undefined);
      mocks.organizationSettingsService.findOne.mockResolvedValue({
        _id: makeObjectId(),
        isFirstLogin: true,
      });
      mocks.organizationSettingsService.patch.mockResolvedValue(undefined);

      const result = await service.setupBrand(
        { brandUrl: 'https://acme.com' } as any,
        user,
      );

      expect(result.success).toBe(true);
      expect(result.extractedData.companyName).toBe('Brand');
      expect(mocks.loggerService.warn).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // confirmBrandData
  // =========================================================================

  describe('confirmBrandData', () => {
    const brandId = makeObjectId();
    const brand = { _id: brandId };

    it('patches brand fields and syncs org label', async () => {
      mocks.brandsService.findOne.mockResolvedValue(brand);
      mocks.brandsService.patch.mockResolvedValue(undefined);
      mocks.organizationsService.generateUniqueSlug.mockResolvedValue(
        'newname',
      );
      mocks.organizationsService.patch.mockResolvedValue(undefined);

      const dto = {
        description: 'New desc',
        label: 'NewName',
        primaryColor: '#abc',
      } as any;
      const result = await service.confirmBrandData(
        brandId.toString(),
        dto,
        user,
      );

      expect(mocks.brandsService.patch).toHaveBeenCalledWith(
        brand._id,
        expect.objectContaining({ description: 'New desc', label: 'NewName' }),
      );
      expect(mocks.organizationsService.patch).toHaveBeenCalledWith(
        expect.any(String),
        { label: 'NewName', slug: 'newname' },
      );
      expect(result.success).toBe(true);
    });

    it('throws 404 when brand not found', async () => {
      mocks.brandsService.findOne.mockResolvedValue(null);

      await expect(
        service.confirmBrandData(brandId.toString(), {} as any, user),
      ).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
    });

    it('updates brand guidance when tone/voice/audience provided', async () => {
      mocks.brandsService.findOne.mockResolvedValue(brand);
      mocks.brandsService.patch.mockResolvedValue(undefined);
      mocks.organizationsService.patch.mockResolvedValue(undefined);

      await service.confirmBrandData(
        brandId.toString(),
        { tone: 'casual', voice: 'friendly' } as any,
        user,
      );

      expect(mocks.brandsService.patch).toHaveBeenCalledWith(
        brand._id,
        expect.objectContaining({
          agentConfig: expect.objectContaining({
            voice: expect.objectContaining({
              style: 'friendly',
              tone: 'casual',
            }),
          }),
        }),
      );
    });
  });
});

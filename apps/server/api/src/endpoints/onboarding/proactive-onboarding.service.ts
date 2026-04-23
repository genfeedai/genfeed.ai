import { BrandEntity } from '@api/collections/brands/entities/brand.entity';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { RolesService } from '@api/collections/roles/services/roles.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { ConfigService } from '@api/config/config.service';
import type {
  CrmGenerateContentDto,
  PrepareBrandDto,
  SendInvitationDto,
} from '@api/endpoints/onboarding/dto/proactive-onboarding.dto';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { generateLabel } from '@api/shared/utils/label/label.util';
import { FontFamily, ProactiveOnboardingStatus } from '@genfeedai/enums';
import type {
  IExtractedBrandData,
  IProactivePreparationStatus,
  IScrapedBrandData,
} from '@genfeedai/interfaces';
import type { Lead } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

/** Credits seeded for proactive onboarding shadow orgs (same as normal signup) */
const PROACTIVE_ONBOARDING_CREDITS = 100;

/** Credits expiry: 1 year */
const PROACTIVE_CREDITS_EXPIRY_MS = 365 * 24 * 60 * 60 * 1000;

type LeadData = {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  proactiveStatus?: ProactiveOnboardingStatus;
  proactiveBatchId?: string;
  invitedAt?: string;
  claimedAt?: string;
  paymentMadeAt?: string;
  convertedAt?: string;
  brandUrl?: string;
  [key: string]: unknown;
};

type LeadWithData = Omit<Lead, 'data'> & {
  data: LeadData;
};

@Injectable()
export class ProactiveOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loggerService: LoggerService,
    private readonly brandScraperService: BrandScraperService,
    private readonly masterPromptGeneratorService: MasterPromptGeneratorService,
    private readonly brandsService: BrandsService,
    private readonly organizationsService: OrganizationsService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly batchGenerationService: BatchGenerationService,
    private readonly clerkService: ClerkService,
    private readonly usersService: UsersService,
    private readonly membersService: MembersService,
    private readonly postsService: PostsService,
    private readonly rolesService: RolesService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Step 1: Create shadow org, scrape brand URL, analyze voice, write brand guidance, seed credits
   */
  async prepareBrand(
    leadId: string,
    organizationId: string,
    dto: PrepareBrandDto,
  ): Promise<{ success: boolean; brandId: string; organizationId: string }> {
    const lead = await this.getLead(leadId, organizationId);

    if (!lead.data.email) {
      throw new BadRequestException(
        'Lead must have an email address for proactive onboarding',
      );
    }

    if (
      lead.data.proactiveStatus !== ProactiveOnboardingStatus.NONE &&
      lead.data.proactiveStatus !== ProactiveOnboardingStatus.BRAND_READY
    ) {
      throw new BadRequestException(
        `Cannot prepare brand in status "${lead.data.proactiveStatus}"`,
      );
    }

    // Update status to preparing
    await this.updateLeadStatus(
      leadId,
      organizationId,
      ProactiveOnboardingStatus.BRAND_PREPARING,
      { brandUrl: dto.brandUrl },
    );

    try {
      // 1. Validate URL
      const validation = this.brandScraperService.validateUrl(dto.brandUrl);
      if (!validation.isValid) {
        throw new BadRequestException(`Invalid URL: ${validation.error}`);
      }

      // 2. Create shadow organization
      let shadowOrg;
      if (lead.proactiveOrganizationId) {
        // Reuse existing shadow org
        shadowOrg = await this.organizationsService.findOne({
          _id: lead.proactiveOrganizationId,
        });
      }

      if (!shadowOrg) {
        const name = lead.data.name ?? '';
        // Create a placeholder user for the shadow org (will be transferred on signup)
        const placeholderUser = await this.usersService.create({
          email: lead.data.email,
          firstName: name.split(' ')[0],
          handle: `proactive-${Date.now()}`,
          isInvited: true,
          lastName: name.split(' ').slice(1).join(' ') || undefined,
        });

        shadowOrg = await this.organizationsService.create({
          isProactiveOnboarding: true,
          isSelected: false,
          label: dto.brandName || lead.data.company || name,
          onboardingCompleted: true,
          user: placeholderUser._id,
        });

        // Create member record (inactive until signup)
        const roleId = await this.resolveDefaultRoleId();
        await this.membersService.create({
          isActive: false,
          organization: shadowOrg._id,
          role: roleId,
          user: placeholderUser._id,
        });
      }

      const shadowOrgId = shadowOrg._id.toString();
      const shadowOrgUserId = this.resolveOrganizationOwnerId(shadowOrg);

      // 3. Scrape brand
      this.loggerService.log('Proactive onboarding: scraping brand', {
        leadId,
        url: dto.brandUrl,
      });

      const detectedSources = this.brandScraperService.detectUrlType(
        dto.brandUrl,
      );
      let scrapedData: IScrapedBrandData;

      if (detectedSources.websiteUrl) {
        scrapedData = await this.brandScraperService.scrapeWebsite(
          dto.brandUrl,
        );
      } else if (detectedSources.linkedinUrl) {
        const linkedinData = await this.brandScraperService.scrapeLinkedIn(
          detectedSources.linkedinUrl,
        );
        scrapedData = {
          aboutText: undefined,
          companyName: linkedinData.companyName,
          description: linkedinData.description,
          fontFamily: undefined,
          heroText: undefined,
          logoUrl: linkedinData.logoUrl,
          metaDescription: linkedinData.description,
          ogImage: linkedinData.coverImageUrl,
          primaryColor: undefined,
          scrapedAt: linkedinData.scrapedAt,
          secondaryColor: undefined,
          socialLinks: {},
          sourceUrl: dto.brandUrl,
          tagline: undefined,
          valuePropositions: [],
        };
      } else if (detectedSources.xProfileUrl) {
        const xData = await this.brandScraperService.scrapeXProfile(
          detectedSources.xProfileUrl,
        );
        scrapedData = {
          aboutText: undefined,
          companyName: xData.displayName,
          description: xData.bio,
          fontFamily: undefined,
          heroText: undefined,
          logoUrl: xData.profileImageUrl,
          metaDescription: xData.bio,
          ogImage: xData.profileImageUrl,
          primaryColor: undefined,
          scrapedAt: xData.scrapedAt,
          secondaryColor: undefined,
          socialLinks: {},
          sourceUrl: dto.brandUrl,
          tagline: undefined,
          valuePropositions: [],
        };
      } else {
        scrapedData = await this.brandScraperService.scrapeWebsite(
          dto.brandUrl,
        );
      }

      // 4. Analyze brand voice
      this.loggerService.log('Proactive onboarding: analyzing brand voice', {
        leadId,
      });
      const brandVoice =
        await this.masterPromptGeneratorService.analyzeBrandVoice(scrapedData, {
          organizationId: shadowOrgId,
          userId: shadowOrgUserId,
        });

      const extractedData: IExtractedBrandData = {
        ...scrapedData,
        brandVoice,
      };

      // 5. Create brand in shadow org
      const name = lead.data.name ?? '';
      const brandLabel =
        dto.brandName || scrapedData.companyName || lead.data.company || name;

      const brandSlug = generateLabel('brand');
      const brand = await this.brandsService.create(
        new BrandEntity({
          backgroundColor: '#000000',
          description:
            scrapedData.description ??
            'Default description. Use it as a pre-prompt',
          fontFamily: scrapedData.fontFamily ?? FontFamily.MONTSERRAT_BLACK,
          handle: brandSlug,
          isSelected: true,
          label: brandLabel,
          organization: shadowOrgId,
          primaryColor: scrapedData.primaryColor ?? '#000000',
          secondaryColor: scrapedData.secondaryColor ?? '#FFFFFF',
          slug: brandSlug,
          text: this.buildBrandSystemPrompt(scrapedData, dto),
          user: shadowOrgUserId,
        }) as unknown as Parameters<BrandsService['create']>[0],
      );

      await this.brandsService.patch(brand._id.toString(), {
        agentConfig: {
          enabledSkills: [],
          voice: brandVoice
            ? {
                audience: brandVoice.audience
                  ? brandVoice.audience
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean)
                  : [],
                hashtags: brandVoice.hashtags ?? [],
                style: brandVoice.voice,
                taglines: brandVoice.taglines ?? [],
                tone: brandVoice.tone,
                values: brandVoice.values ?? [],
              }
            : undefined,
        },
      });

      // 6. Seed credits
      await this.creditsUtilsService.addOrganizationCreditsWithExpiration(
        shadowOrgId,
        PROACTIVE_ONBOARDING_CREDITS,
        'proactive-onboarding',
        `Proactive onboarding credits for lead ${name}`,
        new Date(Date.now() + PROACTIVE_CREDITS_EXPIRY_MS),
      );

      // 7. Update lead with references
      await this.updateLeadStatus(
        leadId,
        organizationId,
        ProactiveOnboardingStatus.BRAND_READY,
        {
          proactiveBrandId: brand._id.toString(),
          proactiveOrganizationId: shadowOrgId,
        },
      );

      this.loggerService.log('Proactive onboarding: brand prepared', {
        brandId: brand._id,
        leadId,
        shadowOrgId,
      });

      return {
        brandId: brand._id.toString(),
        organizationId: shadowOrgId,
        success: true,
      };
    } catch (error: unknown) {
      // Revert status on failure
      await this.updateLeadStatus(
        leadId,
        organizationId,
        ProactiveOnboardingStatus.NONE,
      );

      this.loggerService.error(
        'Proactive onboarding: prepareBrand failed',
        error,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          detail: (error as Error)?.message || 'Failed to prepare brand',
          title: 'Brand Preparation Failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Step 2: Generate content using BatchGenerationService
   */
  async generateContent(
    leadId: string,
    organizationId: string,
    dto: CrmGenerateContentDto,
  ): Promise<{ success: boolean; batchId: string }> {
    const lead = await this.getLead(leadId, organizationId);

    if (lead.data.proactiveStatus !== ProactiveOnboardingStatus.BRAND_READY) {
      throw new BadRequestException(
        'Brand must be prepared before generating content',
      );
    }

    if (!lead.proactiveOrganizationId || !lead.proactiveBrandId) {
      throw new BadRequestException(
        'Shadow organization and brand must exist before generating content',
      );
    }

    await this.updateLeadStatus(
      leadId,
      organizationId,
      ProactiveOnboardingStatus.CONTENT_GENERATING,
    );

    try {
      const shadowOrgId = lead.proactiveOrganizationId;
      const brandId = lead.proactiveBrandId;
      const count = dto.count || 10;

      // Find the shadow org to get user ID
      const shadowOrg = await this.organizationsService.findOne({
        _id: shadowOrgId,
      });

      if (!shadowOrg) {
        throw new NotFoundException('Shadow organization not found');
      }

      const shadowOrgUserId = this.resolveOrganizationOwnerId(shadowOrg);

      // Create date range: starting tomorrow, spread over 30 days
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 31);

      const batch = await this.batchGenerationService.createBatch(
        {
          brandId,
          count,
          dateRange: {
            end: endDate.toISOString(),
            start: startDate.toISOString(),
          },
          platforms: dto.platforms || ['instagram', 'twitter'],
          topics: dto.topics || [],
        },
        shadowOrgUserId,
        shadowOrgId,
      );

      await this.updateLeadStatus(
        leadId,
        organizationId,
        ProactiveOnboardingStatus.READY,
        { proactiveBatchId: batch.id },
      );

      this.loggerService.log('Proactive onboarding: content generated', {
        batchId: batch.id,
        count,
        leadId,
      });

      return { batchId: batch.id, success: true };
    } catch (error: unknown) {
      await this.updateLeadStatus(
        leadId,
        organizationId,
        ProactiveOnboardingStatus.BRAND_READY,
      );

      this.loggerService.error(
        'Proactive onboarding: generateContent failed',
        error,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          detail: (error as Error)?.message || 'Failed to generate content',
          title: 'Content Generation Failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Step 3: Send Clerk invitation to lead
   */
  async sendInvitation(
    leadId: string,
    organizationId: string,
    dto: SendInvitationDto,
  ): Promise<{ success: boolean; invitedAt: Date }> {
    const lead = await this.getLead(leadId, organizationId);

    if (!lead.data.email) {
      throw new BadRequestException(
        'Lead must have an email address to send invitation',
      );
    }

    if (
      lead.data.proactiveStatus !== ProactiveOnboardingStatus.CONTENT_READY &&
      lead.data.proactiveStatus !== ProactiveOnboardingStatus.INVITED
    ) {
      throw new BadRequestException(
        'Content must be generated before sending invitation',
      );
    }

    if (!lead.proactiveOrganizationId) {
      throw new BadRequestException('Shadow organization must exist');
    }

    try {
      // Find the placeholder user in the shadow org
      const shadowOrg = await this.organizationsService.findOne({
        _id: lead.proactiveOrganizationId,
      });

      if (!shadowOrg) {
        throw new NotFoundException('Shadow organization not found');
      }

      const shadowOrgUserId = this.resolveOrganizationOwnerId(shadowOrg);

      // Send Clerk invitation with proactive onboarding metadata
      const redirectUrl = this.getProactiveRedirectUrl();

      await this.clerkService.createInvitation(lead.data.email, redirectUrl, {
        isProactiveOnboarding: true,
        leadId,
        organizationId: lead.proactiveOrganizationId,
        userId: shadowOrgUserId,
      });

      const invitedAt = new Date();

      await this.updateLeadStatus(
        leadId,
        organizationId,
        ProactiveOnboardingStatus.INVITED,
        { invitedAt: invitedAt.toISOString() },
      );

      this.loggerService.log('Proactive onboarding: invitation sent', {
        email: lead.data.email,
        leadId,
      });

      return { invitedAt, success: true };
    } catch (error: unknown) {
      this.loggerService.error(
        'Proactive onboarding: sendInvitation failed',
        error,
      );

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          detail: (error as Error)?.message || 'Failed to send invitation',
          title: 'Invitation Failed',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get current preparation status for a lead
   */
  async getPreparationStatus(
    leadId: string,
    organizationId: string,
  ): Promise<IProactivePreparationStatus> {
    const lead = await this.getLead(leadId, organizationId);

    const result: IProactivePreparationStatus = {
      generatedAssetCount: 0,
      inviteEligible: false,
      prepPercent: this.getPrepPercent(lead.data.proactiveStatus),
      prepStage: this.getPrepStage(lead.data.proactiveStatus),
      proactiveStatus:
        lead.data.proactiveStatus ?? ProactiveOnboardingStatus.NONE,
    };

    // Fetch brand details if available
    if (lead.proactiveBrandId) {
      const brand = await this.brandsService.findOne(
        { _id: lead.proactiveBrandId, isDeleted: false },
        'none',
      );

      if (brand) {
        result.brand = {
          colors: [brand.primaryColor, brand.secondaryColor].filter(
            Boolean,
          ) as string[],
          id: brand._id.toString(),
          name: brand.label || '',
          voiceTone: brand.description || undefined,
        };
      }
    }

    // Fetch batch details if available
    if (lead.data.proactiveBatchId && lead.proactiveOrganizationId) {
      try {
        const batch = await this.batchGenerationService.getBatch(
          lead.data.proactiveBatchId,
          lead.proactiveOrganizationId,
        );

        if (batch) {
          result.generatedAssetCount = batch.completedItems ?? 0;
          result.batch = {
            completedPosts: batch.completedItems ?? 0,
            id: batch.id,
            platforms: batch.platforms ?? [],
            totalPosts: batch.totalItems ?? 0,
          };
        }
      } catch {
        // Batch may not exist yet or may have been cleaned up
      }
    }

    // Fetch invitation details
    if (lead.data.invitedAt && lead.data.email) {
      result.invitation = {
        email: lead.data.email,
        invitedAt: lead.data.invitedAt,
      };
    }

    if (lead.data.claimedAt) {
      result.claimedAt = lead.data.claimedAt;
    }

    if (lead.data.paymentMadeAt) {
      result.paymentMadeAt = lead.data.paymentMadeAt;
    }

    // Fetch organization details
    if (lead.proactiveOrganizationId) {
      const org = await this.organizationsService.findOne({
        _id: lead.proactiveOrganizationId,
      });

      if (org) {
        result.organization = {
          id: org._id.toString(),
          label: org.label,
        };
      }
    }

    result.inviteEligible = this.isInviteEligible(lead.data.proactiveStatus);

    if (
      result.proactiveStatus === ProactiveOnboardingStatus.READY &&
      result.generatedAssetCount === 0 &&
      result.batch
    ) {
      result.generatedAssetCount = result.batch.completedPosts;
    }

    return result;
  }

  async getWorkspaceSummary(
    leadId: string,
    organizationId: string,
  ): Promise<{
    success: boolean;
    proactiveStatus: ProactiveOnboardingStatus;
    prepPercent: number;
    prepStage: string;
    brand?: IProactivePreparationStatus['brand'];
    organization?: IProactivePreparationStatus['organization'];
    outputs: unknown[];
    summary: string;
  }> {
    const lead = await this.getLead(leadId, organizationId);
    const status = await this.getPreparationStatus(leadId, organizationId);
    const outputs = await this.getLeadOutputs(lead);

    return {
      brand: status.brand,
      organization: status.organization,
      outputs,
      prepPercent: status.prepPercent ?? 0,
      prepStage: status.prepStage ?? 'not_started',
      proactiveStatus:
        lead.data.proactiveStatus ?? ProactiveOnboardingStatus.NONE,
      success: true,
      summary: this.buildWorkspaceSummary(status, outputs.length),
    };
  }

  async claimWorkspace(
    leadIdOrShadowOrgId: string,
    organizationIdOrUserId: string,
    userIdArg?: string,
  ): Promise<{
    success: boolean;
    proactiveStatus: ProactiveOnboardingStatus;
    outputs: unknown[];
    brand?: IProactivePreparationStatus['brand'];
    organization?: IProactivePreparationStatus['organization'];
    prepPercent: number;
    prepStage: string;
    claimedAt?: Date;
    summary: string;
  }> {
    const claimContext = userIdArg
      ? await this.getLeadClaimContext(
          leadIdOrShadowOrgId,
          organizationIdOrUserId,
          userIdArg,
        )
      : await this.getShadowOrgClaimContext(
          leadIdOrShadowOrgId,
          organizationIdOrUserId,
        );

    const { lead, organizationId } = claimContext;

    if (!lead.proactiveOrganizationId) {
      throw new BadRequestException('Shadow organization must exist');
    }

    if (
      lead.data.proactiveStatus !== ProactiveOnboardingStatus.INVITED &&
      lead.data.proactiveStatus !== ProactiveOnboardingStatus.STARTED &&
      lead.data.proactiveStatus !== ProactiveOnboardingStatus.PAYMENT_MADE &&
      lead.data.proactiveStatus !== ProactiveOnboardingStatus.CONVERTED
    ) {
      throw new BadRequestException('Lead must be invited before claiming');
    }

    let claimedAt: Date | undefined;
    if (lead.data.proactiveStatus === ProactiveOnboardingStatus.INVITED) {
      claimedAt = new Date();
      await this.updateLeadStatus(
        lead.id,
        organizationId,
        ProactiveOnboardingStatus.STARTED,
        { claimedAt: claimedAt.toISOString() },
      );
      lead.data.proactiveStatus = ProactiveOnboardingStatus.STARTED;
      lead.data.claimedAt = claimedAt.toISOString();
    }

    const workspace = userIdArg
      ? await this.getWorkspaceSummary(lead.id, organizationId)
      : undefined;
    const fallbackStatus =
      workspace ?? (await this.getPreparationStatus(lead.id, organizationId));
    const outputs = workspace?.outputs ?? (await this.getLeadOutputs(lead));
    const summary =
      workspace?.summary ??
      this.buildWorkspaceSummary(fallbackStatus, outputs.length);

    return {
      brand: fallbackStatus.brand,
      claimedAt,
      organization: fallbackStatus.organization,
      outputs,
      prepPercent: fallbackStatus.prepPercent ?? 0,
      prepStage: fallbackStatus.prepStage ?? 'ready',
      proactiveStatus: ProactiveOnboardingStatus.STARTED,
      success: true,
      summary,
    };
  }

  async markPaymentMade(
    leadIdOrShadowOrgId: string,
    organizationId?: string,
  ): Promise<{ success: boolean; paymentMadeAt: Date }> {
    const lead = organizationId
      ? await this.getLead(leadIdOrShadowOrgId, organizationId)
      : await this.getLeadByShadowOrganization(leadIdOrShadowOrgId);

    if (
      lead.data.proactiveStatus !== ProactiveOnboardingStatus.STARTED &&
      lead.data.proactiveStatus !== ProactiveOnboardingStatus.PAYMENT_MADE &&
      lead.data.proactiveStatus !== ProactiveOnboardingStatus.CONVERTED
    ) {
      throw new BadRequestException(
        'Lead must be started before payment can be recorded',
      );
    }

    const paymentMadeAt = new Date();
    const leadOrganizationId = organizationId ?? lead.organizationId ?? '';

    await this.updateLeadStatus(
      lead.id,
      leadOrganizationId,
      ProactiveOnboardingStatus.PAYMENT_MADE,
      { paymentMadeAt: paymentMadeAt.toISOString() },
    );

    return { paymentMadeAt, success: true };
  }

  /**
   * Get posts generated for a lead's shadow org (for admin review)
   */
  async reviewContent(
    leadId: string,
    organizationId: string,
  ): Promise<{ posts: unknown[] }> {
    const lead = await this.getLead(leadId, organizationId);

    if (!lead.proactiveOrganizationId) {
      return { posts: [] };
    }

    const posts = await this.postsService.find({
      isDeleted: false,
      organization: lead.proactiveOrganizationId,
    });

    return { posts };
  }

  // === Private helpers ===

  private async getLead(
    leadId: string,
    organizationId: string,
  ): Promise<LeadWithData> {
    const lead = await this.prisma.lead.findFirst({
      where: {
        id: leadId,
        isDeleted: false,
        organizationId,
      },
    });

    if (!lead) {
      throw new NotFoundException(`Lead "${leadId}" not found`);
    }

    return { ...lead, data: this.normalizeLeadData(lead.data) };
  }

  private async getLeadByShadowOrganization(
    shadowOrganizationId: string,
  ): Promise<LeadWithData> {
    const lead = await this.prisma.lead.findFirst({
      where: {
        isDeleted: false,
        proactiveOrganizationId: shadowOrganizationId,
      },
    });

    if (!lead) {
      throw new NotFoundException(
        `Lead for shadow organization "${shadowOrganizationId}" not found`,
      );
    }

    return { ...lead, data: this.normalizeLeadData(lead.data) };
  }

  private async getLeadClaimContext(
    leadId: string,
    organizationId: string,
    _userId: string,
  ): Promise<{ lead: LeadWithData; organizationId: string }> {
    return {
      lead: await this.getLead(leadId, organizationId),
      organizationId,
    };
  }

  private async getShadowOrgClaimContext(
    shadowOrganizationId: string,
    _userId: string,
  ): Promise<{ lead: LeadWithData; organizationId: string }> {
    const lead = await this.getLeadByShadowOrganization(shadowOrganizationId);

    return {
      lead,
      organizationId: lead.organizationId ?? '',
    };
  }

  private async updateLeadStatus(
    leadId: string,
    organizationId: string,
    status: ProactiveOnboardingStatus,
    extraFields?: Record<string, unknown>,
  ): Promise<void> {
    const existing = await this.prisma.lead.findFirst({
      where: { id: leadId, isDeleted: false, organizationId },
    });

    if (!existing) {
      return;
    }

    const currentData = (existing.data as LeadData) ?? {};
    const updatePayload: Record<string, unknown> = {
      data: { ...currentData, proactiveStatus: status, ...extraFields },
    };

    // Sync relational fields to top-level Prisma columns if provided
    if (extraFields?.proactiveOrganizationId) {
      updatePayload.proactiveOrganizationId =
        extraFields.proactiveOrganizationId;
    }
    if (extraFields?.proactiveBrandId) {
      updatePayload.proactiveBrandId = extraFields.proactiveBrandId;
    }

    await this.prisma.lead.update({
      data: updatePayload as never,
      where: { id: leadId },
    });
  }

  private getProactiveRedirectUrl(): string | undefined {
    const appUrl = this.configService.get('GENFEEDAI_APP_URL');

    if (typeof appUrl !== 'string' || appUrl.length === 0) {
      return undefined;
    }

    return `${appUrl.replace(/\/$/, '')}/onboarding/proactive`;
  }

  private normalizeLeadData(data: Lead['data']): LeadData {
    return ((data as unknown as LeadData | null | undefined) ?? {}) as LeadData;
  }

  private resolveOrganizationOwnerId(shadowOrg: {
    _id?: string;
    user?: string | null;
    userId?: string | null;
  }): string {
    const ownerId = shadowOrg.user ?? shadowOrg.userId;

    if (!ownerId) {
      throw new BadRequestException(
        `Shadow organization "${shadowOrg._id ?? 'unknown'}" has no owner`,
      );
    }

    return ownerId.toString();
  }

  private async resolveDefaultRoleId(): Promise<string> {
    const role =
      (await this.rolesService.findOne({
        isDeleted: false,
        key: 'admin',
      })) ??
      (await this.rolesService.findOne({
        isDeleted: false,
        key: 'user',
      }));

    if (!role?._id) {
      throw new NotFoundException(
        'No valid default role found for proactive onboarding',
      );
    }

    return role._id.toString();
  }

  private getPrepStage(status?: ProactiveOnboardingStatus): string {
    switch (status) {
      case ProactiveOnboardingStatus.BRAND_PREPARING:
        return 'researching_brand';
      case ProactiveOnboardingStatus.BRAND_READY:
        return 'brand_ready';
      case ProactiveOnboardingStatus.CONTENT_GENERATING:
        return 'generating_outputs';
      case ProactiveOnboardingStatus.READY:
      case ProactiveOnboardingStatus.INVITED:
      case ProactiveOnboardingStatus.STARTED:
      case ProactiveOnboardingStatus.PAYMENT_MADE:
      case ProactiveOnboardingStatus.CONVERTED:
        return 'ready';
      default:
        return 'not_started';
    }
  }

  private getPrepPercent(status?: ProactiveOnboardingStatus): number {
    switch (status) {
      case ProactiveOnboardingStatus.BRAND_PREPARING:
        return 25;
      case ProactiveOnboardingStatus.BRAND_READY:
        return 55;
      case ProactiveOnboardingStatus.CONTENT_GENERATING:
        return 80;
      case ProactiveOnboardingStatus.READY:
      case ProactiveOnboardingStatus.INVITED:
      case ProactiveOnboardingStatus.STARTED:
      case ProactiveOnboardingStatus.PAYMENT_MADE:
      case ProactiveOnboardingStatus.CONVERTED:
        return 100;
      default:
        return 0;
    }
  }

  private isInviteEligible(status?: ProactiveOnboardingStatus): boolean {
    return [
      ProactiveOnboardingStatus.READY,
      ProactiveOnboardingStatus.INVITED,
      ProactiveOnboardingStatus.STARTED,
      ProactiveOnboardingStatus.PAYMENT_MADE,
      ProactiveOnboardingStatus.CONVERTED,
    ].includes(status as ProactiveOnboardingStatus);
  }

  private async getLeadOutputs(lead: LeadWithData): Promise<unknown[]> {
    if (!lead.proactiveOrganizationId) {
      return [];
    }

    const posts = await this.postsService.find({
      isDeleted: false,
      organization: lead.proactiveOrganizationId,
    });

    return posts.slice(0, 3);
  }

  private buildWorkspaceSummary(
    status: Pick<IProactivePreparationStatus, 'brand' | 'organization'>,
    outputCount: number,
  ): string {
    const parts = [
      status.organization?.label
        ? `${status.organization.label} is prebuilt`
        : 'Your workspace is prebuilt',
      status.brand?.name ? `with ${status.brand.name} context` : undefined,
      outputCount > 0 ? `and ${outputCount} starter outputs ready` : undefined,
    ].filter(Boolean);

    return `${parts.join(' ')}.`;
  }

  private buildBrandSystemPrompt(
    scrapedData: IScrapedBrandData,
    dto: PrepareBrandDto,
  ): string {
    const parts: string[] = [];

    if (scrapedData.companyName) {
      parts.push(`You are creating content for ${scrapedData.companyName}.`);
    }

    if (scrapedData.tagline) {
      parts.push(`Brand tagline: "${scrapedData.tagline}"`);
    }

    if (scrapedData.aboutText) {
      parts.push(`About the brand: ${scrapedData.aboutText}`);
    }

    if (dto.industry) {
      parts.push(`Industry: ${dto.industry}`);
    }

    if (dto.targetAudience) {
      parts.push(`Target audience: ${dto.targetAudience}`);
    }

    return parts.join('\n\n');
  }
}
